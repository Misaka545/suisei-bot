const { SlashCommandBuilder, ChannelType } = require("discord.js");
const play = require("play-dl");
const { makeYtdlpResource } = require("../../utils/youtubeHelpers");
const { ensureMusic, connectIfNeeded, enqueue, AudioPlayerStatus } = require("../../utils/musicState");
const { httpsJson, getSpotifyToken, spotifyApiGet } = require("../../utils/spotifyApi");

const MAX_ENQUEUE = 25;

async function extractYouTubePlaylist(url, max = MAX_ENQUEUE) {
  const ytdlp = require("yt-dlp-exec");
  const out = await ytdlp(url, {
    dumpSingleJson: true, flatPlaylist: true, playlistEnd: max, skipDownload: true, noWarnings: true, quiet: true,
  });
  const data = typeof out === "string" ? JSON.parse(out) : out;
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  return entries.map((e) => {
    const id = e.id || e.url; const title = e.title || id;
    const videoUrl = id && !String(id).startsWith("http") ? `https://www.youtube.com/watch?v=${id}` : e.url || id;
    return { input: videoUrl, title };
  });
}

async function fetchJson(url) {
  const https = require("https");
  const { Buffer } = require("buffer");
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

const trackQueryCache = new Map();
async function spotifyTrackToQuery(spotifyTrackUrl) {
  if (trackQueryCache.has(spotifyTrackUrl)) return trackQueryCache.get(spotifyTrackUrl);
  const meta = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyTrackUrl)}`);
  if (!meta?.title) throw new Error("Spotify oEmbed returned no title");
  const q = meta.title.replace(/\s*[—·]\s*/g, " - ").trim();
  trackQueryCache.set(spotifyTrackUrl, q);
  return q;
}

async function extractSpotifyCollectionQueries(spotifyUrl, max = MAX_ENQUEUE) {
  const m = spotifyUrl.match(/open\.spotify\.com\/(playlist|album)\/([A-Za-z0-9]+)(?:\?|$)/i);
  if (!m) throw new Error("Invalid Spotify playlist/album URL");
  const kind = m[1].toLowerCase(); const id = m[2];
  const token = await getSpotifyToken();
  const queries = [];
  if (kind === "album") {
    let url = `https://api.spotify.com/v1/albums/${id}/tracks?limit=50&offset=0`;
    while (url && queries.length < max) {
      const data = await spotifyApiGet(url, token);
      for (const it of data.items || []) {
        if (!it?.name || !it?.artists?.length) continue;
        queries.push(`${it.artists[0].name} - ${it.name}`);
        if (queries.length >= max) break;
      }
      url = data.next || null;
    }
  } else {
    let url = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&offset=0`;
    while (url && queries.length < max) {
      const data = await spotifyApiGet(url, token);
      for (const it of data.items || []) {
        const tr = it.track;
        if (!tr || tr.is_local) continue;
        if (!tr.name || !tr.artists?.length) continue;
        queries.push(`${tr.artists[0].name} - ${tr.name}`);
        if (queries.length >= max) break;
      }
      url = data.next || null;
    }
  }
  if (!queries.length) throw new Error("No tracks found in Spotify collection");
  return queries;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song/album/playlist from Spotify or YouTube")
    .addStringOption((opt) =>
      opt.setName("url").setDescription("Spotify track/album/playlist or YouTube link").setRequired(true)
    ),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const voiceChannel = member?.voice?.channel;
    const inputRaw = interaction.options.getString("url")?.trim();

    if (!voiceChannel) return interaction.reply("❌ You must join a voice channel first!");
    if (!inputRaw) return interaction.reply("❌ Please provide a Spotify or YouTube link.");
    await interaction.reply(`🎶 Loading: ${inputRaw}`);

    try {
      const st = await connectIfNeeded(interaction, voiceChannel, { selfDeaf: true });
      let target = inputRaw;
      const ytId = target.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/)?.[1];
      if (ytId) target = `https://www.youtube.com/watch?v=${ytId}`;

      const itemsToAdd = [];
      let followMsg = "";
      const isYouTube = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(target);
      const hasList = /[?&]list=/.test(target);

      if (isYouTube && !hasList) {
        itemsToAdd.push({ input: target, title: target });
        followMsg = `✅ Queued: ${target}`;
      } else {
        let validation;
        try { validation = await Promise.resolve(play.validate(target)); } catch { validation = null; }
        if (validation === "yt_playlist" || /[?&]list=/.test(target)) {
          const entries = await extractYouTubePlaylist(target, MAX_ENQUEUE);
          for (const e of entries) itemsToAdd.push({ input: e.input, title: e.title });
          followMsg = `📜 Queued **${itemsToAdd.length}** tracks from the YouTube playlist.`;
        } else if (/open\.spotify\.com\/(playlist|album)\//i.test(target)) {
          const queries = await extractSpotifyCollectionQueries(target, MAX_ENQUEUE);
          for (const q of queries) itemsToAdd.push({ input: `ytsearch1:${q}`, title: q });
          const kind = /playlist/.test(target) ? "playlist" : "album";
          followMsg = `🎧 Queued **${itemsToAdd.length}** tracks from the Spotify ${kind} (matched on YouTube).`;
        } else if (validation === "sp_track" || /open\.spotify\.com\/track\//i.test(target)) {
          const q = await spotifyTrackToQuery(target);
          itemsToAdd.push({ input: `ytsearch1:${q}`, title: q });
          followMsg = `✅ Queued: **${q}**`;
        } else {
          itemsToAdd.push({ input: target, title: target });
          followMsg = `✅ Queued: ${target}`;
        }
      }

      // push to queue & maybe start
      const state = ensureMusic(guildId);
      for (const it of itemsToAdd) state.queue.push(it);
      const { proc, resource } = require("../../utils/youtubeHelpers").makeYtdlpResource;

      if (st.player.state.status !== require("../../utils/musicState").AudioPlayerStatus.Playing) {
        // start first
        const { makeYtdlpResource } = require("../../utils/youtubeHelpers");
        const next = state.queue.shift();
        const { proc, resource } = makeYtdlpResource(next.input);
        resource.metadata = { title: next.title || next.input, url: next.input };
        state.currentProc = proc;
        state.currentTrack = { ...next };

        st.player.removeAllListeners(); // rebind listeners once
        st.player.on(require("../../utils/musicState").AudioPlayerStatus.Idle, () => {
          const finished = state.currentTrack;
          const wasSkipping = state.skipping;
          state.skipping = false;
          if (finished) {
            if (state.loopMode === "track") {
              if (!wasSkipping) state.queue.unshift({ ...finished });
            } else if (state.loopMode === "queue") {
              state.queue.push({ ...finished });
            }
          }
          try { state.currentProc?.kill?.(); } catch {}
          state.currentProc = null; state.currentTrack = null;

          // play next
          const n = state.queue.shift();
          if (!n) {
            require("../../utils/musicState").disconnectGuild(guildId);
            return;
          }
          const { proc: p2, resource: r2 } = makeYtdlpResource(n.input);
          r2.metadata = { title: n.title || n.input, url: n.input };
          state.currentProc = p2; state.currentTrack = { ...n };
          st.player.play(r2);
        });

        st.player.on("error", () => {
          try { state.currentProc?.kill?.(); } catch {}
          state.currentProc = null;
        });

        st.player.play(resource); // already made above
      }

      return interaction.followUp(followMsg);
    } catch (err) {
      console.error(err);
      return interaction.followUp(`⚠️ Error: Could not play/enqueue.\n\`\`\`${err.message || err}\`\`\``);
    }
  },
};
