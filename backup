// Suisei.js — YouTube via yt-dlp, Spotify→YouTube via:
//  - oEmbed (single track, no auth)
//  - Spotify Web API Client Credentials (playlist/album)
// Includes queue, YouTube playlist expansion, big buffer, steady rate
// Controls: /skip /pause /resume /stop /queue /loop /shuffle
// Jitter fix: prefetch before playback

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");
require("dotenv").config();

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} = require("@discordjs/voice");

const https = require("https");
const { URL } = require("node:url");
const { Buffer } = require("node:buffer");
const { PassThrough } = require("stream");
const play = require("play-dl");          // v1.x (validate + YouTube search)
const ytdlp = require("yt-dlp-exec");     // playback + metadata via yt-dlp
const ffmpegPath = require("ffmpeg-static");
process.env.FFMPEG_PATH = ffmpegPath || process.env.FFMPEG_PATH || "";

// ---------- Config ----------
const MAX_ENQUEUE = 25; // cap how many items we enqueue from a playlist/album
const YTDLP_HEADERS = [
  "User-Agent: Mozilla/5.0",
  "Accept-Language: en-US,en;q=0.9",
];
const YTDLP_RATE = "1.5M"; // throttle for smoother pacing (raise or remove if you have bandwidth)

// Jitter tuning
const PREFETCH_MS = 1200;               // ~1.2s prebuffer
const PREFETCH_BYTES = 2 * 1024 * 1024; // cap prebuffer to 2 MB
const RESOURCE_HWM = 1 << 25;           // 32 MB resource buffer

// ---------- Small helpers ----------
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// Spotify single track → YouTube search query via public oEmbed (no auth)
async function spotifyTrackToQuery(spotifyTrackUrl) {
  const meta = await fetchJson(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyTrackUrl)}`
  );
  if (!meta?.title) throw new Error("Spotify oEmbed returned no title");
  // meta.title often "Track — Artist" or "Track · Artist"
  return meta.title.replace(/\s*[—·]\s*/g, " - ").trim();
}

// YouTube playlist → list of items (id/title), limited to MAX_ENQUEUE
async function extractYouTubePlaylist(url, max = MAX_ENQUEUE) {
  const out = await ytdlp(url, {
    dumpSingleJson: true,
    flatPlaylist: true,
    playlistEnd: max,
    skipDownload: true,
    noWarnings: true,
    quiet: true,
  });
  const data = typeof out === "string" ? JSON.parse(out) : out;
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  return entries.map((e) => {
    const id = e.id || e.url;
    const title = e.title || id;
    const videoUrl = id && !String(id).startsWith("http")
      ? `https://www.youtube.com/watch?v=${id}`
      : (e.url || id);
    return { input: videoUrl, title };
  });
}

// ---------- Spotify Web API (Client Credentials; NO redirect URI) ----------
function httpsJson(fullUrl, headers = {}, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + (u.search || ""),
      port: 443,
      method,
      headers,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getSpotifyToken() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing SPOTIFY_CLIENT_ID/SECRET in .env");
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const form = "grant_type=client_credentials";
  const json = await httpsJson(
    "https://accounts.spotify.com/api/token",
    {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(form),
    },
    "POST",
    form
  );
  if (!json?.access_token) throw new Error("Could not obtain Spotify access token");
  return json.access_token;
}

async function spotifyApiGet(url, token) {
  return httpsJson(url, { "Authorization": `Bearer ${token}` });
}

// Expand Spotify album/playlist → array of "Artist - Title" strings (max limited)
async function extractSpotifyCollectionQueries(spotifyUrl, max = MAX_ENQUEUE) {
  const m = spotifyUrl.match(/open\.spotify\.com\/(playlist|album)\/([A-Za-z0-9]+)(?:\?|$)/i);
  if (!m) throw new Error("Invalid Spotify playlist/album URL");
  const kind = m[1].toLowerCase();
  const id = m[2];

  const token = await getSpotifyToken();

  const queries = [];
  if (kind === "album") {
    let url = `https://api.spotify.com/v1/albums/${id}/tracks?limit=50&offset=0`;
    while (url && queries.length < max) {
      const data = await spotifyApiGet(url, token);
      for (const it of data.items || []) {
        if (!it?.name || !it?.artists?.length) continue;
        const artist = it.artists[0].name;
        const name = it.name;
        queries.push(`${artist} - ${name}`);
        if (queries.length >= max) break;
      }
      url = data.next || null;
    }
  } else if (kind === "playlist") {
    let url = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&offset=0`;
    while (url && queries.length < max) {
      const data = await spotifyApiGet(url, token);
      for (const it of data.items || []) {
        const tr = it.track;
        if (!tr || tr.is_local) continue;
        if (!tr.name || !tr.artists?.length) continue;
        const artist = tr.artists[0].name;
        const name = tr.name;
        queries.push(`${artist} - ${name}`);
        if (queries.length >= max) break;
      }
      url = data.next || null;
    }
  } else {
    throw new Error(`Unsupported Spotify type: ${kind}`);
  }

  if (!queries.length) throw new Error("No tracks found in Spotify collection");
  return queries;
}

// ---------- yt-dlp streaming with prefetch (jitter fix) ----------
function makeYtdlpResource(input) {
  const proc = ytdlp.exec(input, {
    output: "-",
    quiet: true,
    format: "bestaudio[ext=webm][acodec=opus]/bestaudio/best",
    addHeader: YTDLP_HEADERS,
    "http-chunk-size": "10M",
    "force-ipv4": true,
    limitRate: YTDLP_RATE,
    retries: 3,
    "fragment-retries": 3,
  });

  proc.stderr?.on("data", (d) => {
    const s = d.toString().trim();
    if (s) console.log(`[yt-dlp] ${s}`);
  });

  // Prefetch a bit before giving to the player
  const out = proc.stdout;
  const pt = new PassThrough({ highWaterMark: RESOURCE_HWM });
  let preBytes = 0;
  let prebuffering = true;

  function onData(chunk) {
    if (!prebuffering) return;
    preBytes += chunk.length;
    pt.write(chunk);
    if (preBytes >= PREFETCH_BYTES) {
      prebuffering = false;
      out.off("data", onData);
      out.pipe(pt, { end: true });
    }
  }

  out.on("error", (e) => pt.destroy(e));
  out.on("end", () => pt.end());
  out.on("data", onData);
  setTimeout(() => {
    if (prebuffering) {
      prebuffering = false;
      out.off("data", onData);
      out.pipe(pt, { end: true });
    }
  }, PREFETCH_MS);

  const resource = createAudioResource(pt, {
    inputType: StreamType.WebmOpus,
    inlineVolume: false,
    highWaterMark: RESOURCE_HWM,
    metadata: {},
  });

  return { proc, resource };
}

// ---------- Discord + per-guild state ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Map<guildId, { connection, player, queue: Array<{input,title}>, currentProc, currentTrack, loopMode, skipping }>
const guilds = new Map();

function ensureGuildState(guildId) {
  let st = guilds.get(guildId);
  if (!st) {
    st = {
      connection: null,
      player: null,
      queue: [],
      currentProc: null,
      currentTrack: null,   // {input, title}
      loopMode: "off",      // "off" | "track" | "queue"
      skipping: false,      // true only during /skip to adjust loop behavior
    };
    guilds.set(guildId, st);
  }
  return st;
}

async function connectIfNeeded(interaction, voiceChannel) {
  const guildId = interaction.guild.id;
  const st = ensureGuildState(guildId);

  if (
    !st.connection ||
    st.connection.state.status === VoiceConnectionStatus.Destroyed ||
    st.connection.state.status === VoiceConnectionStatus.Disconnected
  ) {
    st.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    st.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    st.connection.subscribe(st.player);

    st.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log(`[${guildId}] ⚠️ Disconnected`);
      try {
        await Promise.race([
          entersState(st.connection, VoiceConnectionStatus.Connecting, 5_000),
          entersState(st.connection, VoiceConnectionStatus.Ready, 5_000),
        ]);
        console.log(`[${guildId}] 🔁 Reconnected`);
      } catch {
        try { st.connection.destroy(); } catch {}
        st.connection = null;
        st.player = null;
        console.log(`[${guildId}] 🚪 Disconnected permanently`);
      }
    });

    st.connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log(`[${guildId}] 🛑 Connection destroyed`);
      st.connection = null;
      st.player = null;
      st.queue = [];
      st.currentProc = null;
      st.currentTrack = null;
      st.skipping = false;
    });

    st.player.on(AudioPlayerStatus.Playing, () => {
      console.log(`[${guildId}] ▶️ Playing`);
    });

    st.player.on(AudioPlayerStatus.Idle, () => {
      console.log(`[${guildId}] ⏭️ Track finished`);

      // Handle loop behavior based on how we finished (natural vs skip)
      const finished = st.currentTrack;
      const wasSkipping = st.skipping;
      st.skipping = false;

      if (finished) {
        if (st.loopMode === "track") {
          // Re-add the same track only if it ended naturally (not on skip)
          if (!wasSkipping) st.queue.unshift({ ...finished });
        } else if (st.loopMode === "queue") {
          // Always cycle finished track to the end (even on skip)
          st.queue.push({ ...finished });
        }
      }

      try { st.currentProc?.kill?.(); } catch {}
      st.currentProc = null;
      st.currentTrack = null;

      playNext(guildId);
    });

    st.player.on("error", (e) => {
      console.error(`[${guildId}] ❌ Player error`, e);
      try { st.currentProc?.kill?.(); } catch {}
      st.currentProc = null;
      // On error, just move on
      playNext(guildId);
    });

    await entersState(st.connection, VoiceConnectionStatus.Ready, 20_000);
  }

  return st;
}

function enqueue(guildId, items) {
  const st = ensureGuildState(guildId);
  for (const it of items) st.queue.push(it);
}

function disconnectGuild(guildId) {
  const st = guilds.get(guildId);
  if (!st) return;
  try { st.currentProc?.kill?.(); } catch {}
  try { st.connection?.destroy?.(); } catch {}
  st.connection = null;
  st.player = null;
  st.currentProc = null;
  st.currentTrack = null;
  st.queue = [];
  st.skipping = false;
  // keep loopMode as-is (user preference)
}

function playNext(guildId) {
  const st = guilds.get(guildId);
  if (!st || !st.player || !st.connection) return;

  const next = st.queue.shift();
  if (!next) {
    console.log(`[${guildId}] 🛑 Queue ended — disconnecting`);
    disconnectGuild(guildId);
    return;
  }

  const { proc, resource } = makeYtdlpResource(next.input);
  resource.metadata = { title: next.title || next.input, url: next.input };
  st.currentProc = proc;
  st.currentTrack = { ...next };
  st.player.play(resource);
}

// Fisher–Yates shuffle (in-place)
function shuffleQueueArray(q) {
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
}

// ---------- Commands ----------
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /ping
  if (interaction.commandName === "ping") {
    return interaction.reply("Pong!");
  }

  // /math
  if (interaction.commandName === "math") {
    const expr = interaction.options.getString("expression");
    try {
      const math = require("mathjs");
      const result = math.evaluate(expr);
      return interaction.reply(`🧮 Result: **${result}**`);
    } catch {
      return interaction.reply("❌ Invalid expression!");
    }
  }

  // /play
  if (interaction.commandName === "play") {
    const guildId = interaction.guild.id;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const voiceChannel = member?.voice?.channel;
    const inputRaw = interaction.options.getString("url")?.trim();

    if (!voiceChannel) return interaction.reply("❌ You must join a voice channel first!");
    if (!inputRaw) return interaction.reply("❌ Please provide a Spotify or YouTube link.");

    await interaction.reply(`🎶 Loading: ${inputRaw}`);

    try {
      const st = await connectIfNeeded(interaction, voiceChannel);

      // Normalize YouTube watch URL if video id present
      let target = inputRaw;
      const ytId = target.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/)?.[1];
      if (ytId) target = `https://www.youtube.com/watch?v=${ytId}`;

      // Validate (works whether play-dl returns string or Promise)
      let validation;
      try { validation = await Promise.resolve(play.validate(target)); } catch { validation = null; }
      console.log(`[${guildId}] play.validate = ${validation}`);

      const itemsToAdd = [];

      // 1) YouTube playlist
      if (validation === "yt_playlist" || /[?&]list=/.test(target)) {
        const entries = await extractYouTubePlaylist(target, MAX_ENQUEUE);
        for (const e of entries) itemsToAdd.push({ input: e.input, title: e.title });
        enqueue(guildId, itemsToAdd);
        if (st.player.state.status !== AudioPlayerStatus.Playing) playNext(guildId);
        return interaction.followUp(`📜 Queued **${itemsToAdd.length}** tracks from the YouTube playlist.`);
      }

      // 2) Spotify playlist / album → expand via Spotify Web API (client credentials)
      if (/open\.spotify\.com\/(playlist|album)\//i.test(target)) {
        try {
          const queries = await extractSpotifyCollectionQueries(target, MAX_ENQUEUE);
          for (const q of queries) itemsToAdd.push({ input: `ytsearch1:${q}`, title: q });
          enqueue(guildId, itemsToAdd);
          if (st.player.state.status !== AudioPlayerStatus.Playing) playNext(guildId);
          const kind = /playlist/.test(target) ? "playlist" : "album";
          return interaction.followUp(`🎧 Queued **${itemsToAdd.length}** tracks from the Spotify ${kind} (matched on YouTube).`);
        } catch (e) {
          return interaction.followUp(
            `⚠️ Cannot expand Spotify collection:\n\`\`\`${e.message}\`\`\`\n` +
            `Ensure SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are set in .env (no redirect URI needed).`
          );
        }
      }

      // 3) Spotify single track → oEmbed title → ytsearch1
      if (validation === "sp_track" || /open\.spotify\.com\/track\//i.test(target)) {
        const q = await spotifyTrackToQuery(target);
        itemsToAdd.push({ input: `ytsearch1:${q}`, title: q });
        enqueue(guildId, itemsToAdd);
        if (st.player.state.status !== AudioPlayerStatus.Playing) playNext(guildId);
        return interaction.followUp(`✅ Queued: **${q}**`);
      }

      // 4) YouTube single video (or anything yt-dlp can handle directly)
      itemsToAdd.push({ input: target, title: target });
      enqueue(guildId, itemsToAdd);
      if (st.player.state.status !== AudioPlayerStatus.Playing) playNext(guildId);
      return interaction.followUp(`✅ Queued: ${target}`);

    } catch (err) {
      console.error(`[${interaction.guild.id}] ❌ PLAY COMMAND ERROR:`, err);
      const st = guilds.get(interaction.guild.id);
      if (st && st.player && st.player.state.status !== AudioPlayerStatus.Playing) {
        disconnectGuild(interaction.guild.id);
      }
      await interaction.followUp(
        `⚠️ Error: Could not play/enqueue.\n\`\`\`${err.message || err}\`\`\``
      );
    }
  }

  // /skip — skip current track
  if (interaction.commandName === "skip") {
    const st = guilds.get(interaction.guild.id);
    if (!st || !st.player || !st.connection) {
      return interaction.reply("❌ Nothing is playing.");
    }
    st.skipping = true;             // mark so loop 'track' won't re-add it
    try { st.currentProc?.kill?.(); } catch {}
    st.player.stop(true);           // triggers Idle → playNext
    return interaction.reply("⏭️ Skipped.");
  }

  // /pause — pause playback
  if (interaction.commandName === "pause") {
    const st = guilds.get(interaction.guild.id);
    if (!st || !st.player || !st.connection) {
      return interaction.reply("❌ Nothing is playing.");
    }
    const ok = st.player.pause(true);
    return interaction.reply(ok ? "⏸️ Paused." : "⚠️ Already paused or cannot pause.");
  }

  // /resume — resume playback
  if (interaction.commandName === "resume") {
    const st = guilds.get(interaction.guild.id);
    if (!st || !st.player || !st.connection) {
      return interaction.reply("❌ Nothing is playing.");
    }
    const ok = st.player.unpause();
    return interaction.reply(ok ? "▶️ Resumed." : "⚠️ Already playing or cannot resume.");
  }

  // /stop — stop and clear queue, disconnect
  if (interaction.commandName === "stop") {
    const st = guilds.get(interaction.guild.id);
    if (!st || (!st.player && (!st.queue || st.queue.length === 0))) {
      return interaction.reply("ℹ️ Nothing to stop.");
    }
    disconnectGuild(interaction.guild.id);
    return interaction.reply("🛑 Stopped and cleared the queue.");
  }

  // /queue — show current + upcoming + loop mode
  if (interaction.commandName === "queue") {
    const st = guilds.get(interaction.guild.id);
    if (!st || (!st.player && (!st.queue || st.queue.length === 0))) {
      return interaction.reply("📭 Queue is empty.");
    }

    const lines = [];
    lines.push(`**Loop:** \`${st.loopMode}\``);

    if (st.player?.state?.resource?.metadata) {
      const now = st.player.state.resource.metadata.title || "Unknown";
      lines.push(`**Now:** ${now}`);
    } else {
      lines.push("**Now:** (idle)");
    }

    if (st.queue.length) {
      lines.push("**Up Next:**");
      st.queue.slice(0, 10).forEach((it, i) => {
        const title = it.title || it.input;
        lines.push(`${i + 1}. ${title}`);
      });
      if (st.queue.length > 10) {
        lines.push(`...and ${st.queue.length - 10} more`);
      }
    } else {
      lines.push("_No upcoming tracks._");
    }

    return interaction.reply(lines.join("\n"));
  }

  // /loop — set loop mode: off | track | queue
  if (interaction.commandName === "loop") {
    const mode = interaction.options.getString("mode");
    const st = ensureGuildState(interaction.guild.id);
    if (!["off", "track", "queue"].includes(mode)) {
      return interaction.reply("❌ Invalid mode. Use: off, track, or queue.");
    }
    st.loopMode = mode;
    return interaction.reply(`🔁 Loop mode set to **${mode}**.`);
  }

  // /shuffle — shuffle upcoming queue (does not affect current track)
  if (interaction.commandName === "shuffle") {
    const st = guilds.get(interaction.guild.id);
    if (!st || !st.queue) {
      return interaction.reply("📭 Queue is empty.");
    }
    if (st.queue.length < 2) {
      return interaction.reply("ℹ️ Need at least 2 tracks in the upcoming queue to shuffle.");
    }
    shuffleQueueArray(st.queue); // in-place
    return interaction.reply(`🔀 Shuffled ${st.queue.length} upcoming track${st.queue.length === 1 ? "" : "s"}.`);
  }
});

client.login(process.env.TOKEN);

// ---------- Slash Commands ----------
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Replies with Pong!"),
  new SlashCommandBuilder()
    .setName("math")
    .setDescription("Calculate a math expression")
    .addStringOption((option) =>
      option
        .setName("expression")
        .setDescription("The math expression to evaluate")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song/album/playlist from Spotify or YouTube")
    .addStringOption((opt) =>
      opt
        .setName("url")
        .setDescription("Spotify track/album/playlist or YouTube video/playlist link")
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName("skip").setDescription("Skip the current track"),
  new SlashCommandBuilder().setName("pause").setDescription("Pause playback"),
  new SlashCommandBuilder().setName("resume").setDescription("Resume playback"),
  new SlashCommandBuilder().setName("stop").setDescription("Stop playback and clear the queue"),
  new SlashCommandBuilder().setName("queue").setDescription("Show the playback queue"),
  new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Set loop mode")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("Loop mode: off | track | queue")
        .setRequired(true)
        .addChoices(
          { name: "off", value: "off" },
          { name: "track", value: "track" },
          { name: "queue", value: "queue" },
        )
    ),
  new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the upcoming queue"),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log("🎵 Slash commands registered successfully for specific guild!");
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log("🎵 Slash commands registered globally! (May take up to 1 hour to propagate)");
    }
  } catch (error) {
    console.error("Command registration failed:", error);
  }
})();
