// Suisei_ai_build.js — Music + Character-style AI chat (Gemini) with safe Discord replies
// Fixes: message > 2000 chars (chunking) and deprecated `ephemeral` on defer (use flags)

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags, // for Ephemeral flag
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

const play = require("play-dl");          // v1.x (validate + optional search)
const ytdlp = require("yt-dlp-exec");     // robust playback + metadata
const ffmpegPath = require("ffmpeg-static");
process.env.FFMPEG_PATH = ffmpegPath || process.env.FFMPEG_PATH || "";

// ---------- Google AI (Gemini) ----------
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// ---------- Discord reply helpers (chunk + flags) ----------
const EPHEMERAL_FLAG = (MessageFlags && MessageFlags.Ephemeral) ? MessageFlags.Ephemeral : (1 << 6);
const MAX_DISCORD = 2000;

function chunkText(text, size = MAX_DISCORD) {
  if (!text) return [""];
  const parts = [];
  let i = 0;
  while (i < text.length) {
    parts.push(text.slice(i, i + size));
    i += size;
  }
  return parts;
}
const ephemeralOpt = (isEphemeral) => (isEphemeral ? { flags: EPHEMERAL_FLAG } : {});

async function sendLongReply(interaction, text, { ephemeral = false } = {}) {
  const parts = chunkText(text);
  if (!(interaction.deferred || interaction.replied)) {
    await interaction.reply({ content: parts[0], ...ephemeralOpt(ephemeral) });
  } else {
    await interaction.followUp({ content: parts[0], ...ephemeralOpt(ephemeral) });
  }
  for (let i = 1; i < parts.length; i++) {
    await interaction.followUp({ content: parts[i], ...ephemeralOpt(ephemeral) });
  }
}

async function editOrFollowLong(interaction, text, { ephemeral = false } = {}) {
  const parts = chunkText(text);
  await interaction.editReply({ content: parts[0] });
  for (let i = 1; i < parts.length; i++) {
    await interaction.followUp({ content: parts[i], ...ephemeralOpt(ephemeral) });
  }
}

// ---------- Music Config ----------
const MAX_ENQUEUE = 25; // cap playlist/album expansion
const YTDLP_HEADERS = [
  "User-Agent: Mozilla/5.0",
  "Accept-Language: en-US,en;q=0.9",
];
const YTDLP_RATE = "1.5M"; // raise/remove if your host has bandwidth

// Jitter tuning — faster start prefetch
const PREFETCH_MS = 1200;                 // was 1200
const PREFETCH_BYTES = 2 * 1024 * 1024;  // 1 MB (was 2 MB)
const RESOURCE_HWM = 1 << 25;            // 32 MB

// ---------- Small helpers ----------
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
          catch (e) { reject(e); }
        });
      })
      .on("error", reject);
  });
}

// Tiny LRU cache for Spotify track→query (speeds up repeat)
const trackQueryCache = new Map();
function cacheGet(k) { return trackQueryCache.get(k); }
function cacheSet(k, v) {
  trackQueryCache.set(k, v);
  if (trackQueryCache.size > 100) {
    const firstKey = trackQueryCache.keys().next().value;
    trackQueryCache.delete(firstKey);
  }
}

// Spotify track → YouTube search query via oEmbed (no auth)
async function spotifyTrackToQuery(spotifyTrackUrl) {
  const cached = cacheGet(spotifyTrackUrl);
  if (cached) return cached;
  const meta = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyTrackUrl)}`);
  if (!meta?.title) throw new Error("Spotify oEmbed returned no title");
  const q = meta.title.replace(/\s*[—·]\s*/g, " - ").trim();
  cacheSet(spotifyTrackUrl, q);
  return q;
}

// YouTube playlist → entries
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

// ---------- Spotify Web API (Client Credentials) ----------
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
  } else {
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
  }

  if (!queries.length) throw new Error("No tracks found in Spotify collection");
  return queries;
}

// ---------- yt-dlp streaming with quick prefetch (jitter-safe) ----------
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

// ---------- Discord + per-guild music state ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Map<guildId, { connection, player, queue: Array<{input,title}>, currentProc, currentTrack, loopMode, skipping }>
const music = new Map();
function ensureMusic(guildId) {
  let st = music.get(guildId);
  if (!st) {
    st = { connection: null, player: null, queue: [], currentProc: null, currentTrack: null, loopMode: "off", skipping: false };
    music.set(guildId, st);
  }
  return st;
}

async function connectIfNeeded(interaction, voiceChannel) {
  const guildId = interaction.guild.id;
  const st = ensureMusic(guildId);

  if (!st.connection || st.connection.state.status === VoiceConnectionStatus.Destroyed || st.connection.state.status === VoiceConnectionStatus.Disconnected) {
    st.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    st.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
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
        st.connection = null; st.player = null;
        console.log(`[${guildId}] 🚪 Disconnected permanently`);
      }
    });

    st.connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log(`[${guildId}] 🛑 Connection destroyed`);
      st.connection = null; st.player = null;
      st.queue = []; st.currentProc = null; st.currentTrack = null; st.skipping = false;
    });

    st.player.on(AudioPlayerStatus.Playing, () => console.log(`[${guildId}] ▶️ Playing`));

    st.player.on(AudioPlayerStatus.Idle, () => {
      console.log(`[${guildId}] ⏭️ Track finished`);
      const finished = st.currentTrack;
      const wasSkipping = st.skipping;
      st.skipping = false;

      if (finished) {
        if (st.loopMode === "track") {
          if (!wasSkipping) st.queue.unshift({ ...finished });
        } else if (st.loopMode === "queue") {
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
      playNext(guildId);
    });

    await entersState(st.connection, VoiceConnectionStatus.Ready, 20_000);
  }

  return st;
}

function enqueue(guildId, items) { const st = ensureMusic(guildId); for (const it of items) st.queue.push(it); }
function disconnectGuild(guildId) {
  const st = music.get(guildId); if (!st) return;
  try { st.currentProc?.kill?.(); } catch {}
  try { st.connection?.destroy?.(); } catch {}
  st.connection = null; st.player = null; st.currentProc = null; st.currentTrack = null; st.queue = []; st.skipping = false;
}
function playNext(guildId) {
  const st = music.get(guildId);
  if (!st || !st.player || !st.connection) return;
  const next = st.queue.shift();
  if (!next) { console.log(`[${guildId}] 🛑 Queue ended — disconnecting`); disconnectGuild(guildId); return; }
  const { proc, resource } = makeYtdlpResource(next.input);
  resource.metadata = { title: next.title || next.input, url: next.input };
  st.currentProc = proc; st.currentTrack = { ...next };
  st.player.play(resource);
}
function shuffleQueueArray(q) {
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
}

// ---------- AI chat state (per channel) ----------
/*
   chatSessions: Map<channelId, {
     persona: string,
     memory: string[],
     model: string,  // Gemini model name e.g. gemini-1.5-flash / gemini-1.5-pro
     history: Array<{role:'user'|'assistant', content:string}>
   }>
*/
const chatSessions = new Map();
const MAX_HISTORY_PAIRS = 8;

function defaultPersona() {
  return (
    "You are Suisei, a playful yet helpful virtual idol in a Discord server. " +
    "Speak concisely (<=120 words unless asked), use a friendly tone, and support English or Vietnamese depending on the user's message. " +
    "Avoid overstepping: do not claim you can moderate, execute code, or access private data. " +
    "When asked for code, produce minimal, correct examples. When asked for opinions, be light and fun."
  );
}
function ensureChat(channelId) {
  let s = chatSessions.get(channelId);
  if (!s) {
    s = { persona: defaultPersona(), memory: [], model: DEFAULT_GEMINI_MODEL, history: [] };
    chatSessions.set(channelId, s);
  }
  return s;
}
function pushHistory(session, role, content) {
  session.history.push({ role, content });
  const maxMsgs = MAX_HISTORY_PAIRS * 2;
  if (session.history.length > maxMsgs) {
    session.history.splice(0, session.history.length - maxMsgs);
  }
}

// Convert our history to Gemini format
function toGeminiHistory(session) {
  return session.history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}
function systemInstructionFor(session) {
  const bits = [session.persona];
  if (session.memory.length) {
    bits.push("Long-term facts from users:\n- " + session.memory.join("\n- "));
  }
  return bits.join("\n\n");
}

async function aiGenerate(session, userMsg) {
  const model = genAI.getGenerativeModel({
    model: session.model,
    systemInstruction: systemInstructionFor(session),
  });

  const chat = model.startChat({
    history: toGeminiHistory(session),
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 512,
    },
  });

  const res = await chat.sendMessage(userMsg);
  const text = res?.response?.text?.() || "…";

  pushHistory(session, "user", userMsg);
  pushHistory(session, "assistant", text);
  return text;
}

// ---------- Client + Commands ----------
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // -------------------- BASIC --------------------
  if (interaction.commandName === "ping") return interaction.reply("Pong!");

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

  // -------------------- MUSIC: /play --------------------
  if (interaction.commandName === "play") {
    const guildId = interaction.guild.id;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const voiceChannel = member?.voice?.channel;
    const inputRaw = interaction.options.getString("url")?.trim();

    if (!voiceChannel) return interaction.reply("❌ You must join a voice channel first!");
    if (!inputRaw) return interaction.reply("❌ Please provide a Spotify or YouTube link.");

    await interaction.reply(`🎶 Loading: ${inputRaw}`);

    try {
      // Parallel connect
      const connectPromise = connectIfNeeded(interaction, voiceChannel);

      // Normalize YT watch URL
      let target = inputRaw;
      const ytId = target.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/)?.[1];
      if (ytId) target = `https://www.youtube.com/watch?v=${ytId}`;

      const itemsToAdd = [];
      let followMsg = "";

      // Fast-path: plain YT video (not playlist)
      const isYouTube = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(target);
      const hasList = /[?&]list=/.test(target);
      if (isYouTube && !hasList) {
        itemsToAdd.push({ input: target, title: target });
        followMsg = `✅ Queued: ${target}`;
      } else {
        // Validate when needed
        let validation; try { validation = await Promise.resolve(play.validate(target)); } catch { validation = null; }
        console.log(`[${guildId}] play.validate = ${validation}`);

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

      const st = await connectPromise;
      enqueue(guildId, itemsToAdd);
      if (st.player.state.status !== AudioPlayerStatus.Playing) playNext(guildId);
      return interaction.followUp(followMsg);
    } catch (err) {
      console.error(`[${interaction.guild.id}] ❌ PLAY COMMAND ERROR:`, err);
      const st = music.get(interaction.guild.id);
      if (st && st.player && st.player.state.status !== AudioPlayerStatus.Playing) disconnectGuild(interaction.guild.id);
      return interaction.followUp(`⚠️ Error: Could not play/enqueue.\n\`\`\`${err.message || err}\`\`\``);
    }
  }

  // -------------------- MUSIC: controls --------------------
  if (interaction.commandName === "skip") {
    const st = music.get(interaction.guild.id);
    if (!st || !st.player || !st.connection) return interaction.reply("❌ Nothing is playing.");
    st.skipping = true; try { st.currentProc?.kill?.(); } catch {} st.player.stop(true);
    return interaction.reply("⏭️ Skipped.");
  }
  if (interaction.commandName === "pause") {
    const st = music.get(interaction.guild.id);
    if (!st || !st.player || !st.connection) return interaction.reply("❌ Nothing is playing.");
    return interaction.reply(st.player.pause(true) ? "⏸️ Paused." : "⚠️ Already paused or cannot pause.");
  }
  if (interaction.commandName === "resume") {
    const st = music.get(interaction.guild.id);
    if (!st || !st.player || !st.connection) return interaction.reply("❌ Nothing is playing.");
    return interaction.reply(st.player.unpause() ? "▶️ Resumed." : "⚠️ Already playing or cannot resume.");
  }
  if (interaction.commandName === "stop") {
    const st = music.get(interaction.guild.id);
    if (!st || (!st.player && (!st.queue || st.queue.length === 0))) return interaction.reply("ℹ️ Nothing to stop.");
    disconnectGuild(interaction.guild.id);
    return interaction.reply("🛑 Stopped and cleared the queue.");
  }
  if (interaction.commandName === "queue") {
    const st = music.get(interaction.guild.id);
    if (!st || (!st.player && (!st.queue || st.queue.length === 0))) return interaction.reply("📭 Queue is empty.");
    const lines = [];
    lines.push(`**Loop:** \`${st.loopMode}\``);
    if (st.player?.state?.resource?.metadata) {
      const now = st.player.state.resource.metadata.title || "Unknown";
      lines.push(`**Now:** ${now}`);
    } else lines.push("**Now:** (idle)");
    if (st.queue.length) {
      lines.push("**Up Next:**");
      st.queue.slice(0, 10).forEach((it, i) => lines.push(`${i + 1}. ${it.title || it.input}`));
      if (st.queue.length > 10) lines.push(`...and ${st.queue.length - 10} more`);
    } else lines.push("_No upcoming tracks._");
    return sendLongReply(interaction, lines.join("\n"));
  }
  if (interaction.commandName === "loop") {
    const mode = interaction.options.getString("mode");
    const st = ensureMusic(interaction.guild.id);
    if (!["off", "track", "queue"].includes(mode)) return interaction.reply("❌ Invalid mode. Use: off, track, or queue.");
    st.loopMode = mode;
    return interaction.reply(`🔁 Loop mode set to **${mode}**.`);
  }
  if (interaction.commandName === "shuffle") {
    const st = music.get(interaction.guild.id);
    if (!st || !st.queue) return interaction.reply("📭 Queue is empty.");
    if (st.queue.length < 2) return interaction.reply("ℹ️ Need at least 2 tracks to shuffle.");
    shuffleQueueArray(st.queue);
    return interaction.reply(`🔀 Shuffled ${st.queue.length} upcoming track${st.queue.length === 1 ? "" : "s"}.`);
  }

  // -------------------- AI CHAT (Gemini) --------------------
  if (interaction.commandName === "chat") {
    const message = interaction.options.getString("message");
    const isPrivate = interaction.options.getBoolean("private") ?? false;

    // Use flags instead of deprecated ephemeral on defer
    await interaction.deferReply({ ...ephemeralOpt(isPrivate) });

    try {
      const session = ensureChat(interaction.channelId);
      const reply = await aiGenerate(session, message);
      await editOrFollowLong(interaction, reply, { ephemeral: isPrivate });
    } catch (e) {
      console.error("AI error:", e);
      await interaction.editReply({ content: `❌ AI error: \`${e.message || e}\`` });
    }
  }

  if (interaction.commandName === "chatreset") {
    chatSessions.set(interaction.channelId, { persona: defaultPersona(), memory: [], model: DEFAULT_GEMINI_MODEL, history: [] });
    return interaction.reply("🧹 Chat memory reset for this channel.");
  }

  if (interaction.commandName === "persona") {
    const sub = interaction.options.getSubcommand();
    if (sub === "set") {
      const prompt = interaction.options.getString("prompt");
      const s = ensureChat(interaction.channelId);
      s.persona = prompt;
      return interaction.reply("✨ Persona updated for this channel.");
    }
    if (sub === "view") {
      const s = ensureChat(interaction.channelId);
      return sendLongReply(interaction, `**Current persona:**\n${s.persona}`);
    }
    if (sub === "reset") {
      const s = ensureChat(interaction.channelId);
      s.persona = defaultPersona();
      return interaction.reply("↩️ Persona reset to default.");
    }
  }

  if (interaction.commandName === "model") {
    const sub = interaction.options.getSubcommand();
    if (sub === "set") {
      const name = interaction.options.getString("name"); // e.g., gemini-1.5-flash, gemini-1.5-pro
      const s = ensureChat(interaction.channelId);
      s.model = name;
      return interaction.reply(`🧠 Gemini model set to \`${name}\` for this channel.`);
    }
    if (sub === "view") {
      const s = ensureChat(interaction.channelId);
      return interaction.reply(`🧠 Current Gemini model: \`${s.model}\``);
    }
  }
});

client.login(process.env.TOKEN);

// ---------- Slash Commands ----------
const commands = [
  // basics
  new SlashCommandBuilder().setName("ping").setDescription("Replies with Pong!"),
  new SlashCommandBuilder()
    .setName("math")
    .setDescription("Calculate a math expression")
    .addStringOption((option) =>
      option.setName("expression").setDescription("The math expression to evaluate").setRequired(true)
    ),

  // music
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

  // AI chat (Gemini)
  new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Chat with the Suisei persona (Character.AI-style)")
    .addStringOption((opt) =>
      opt.setName("message").setDescription("Your message").setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt.setName("private").setDescription("Reply privately (ephemeral)").setRequired(false)
    ),
  new SlashCommandBuilder().setName("chatreset").setDescription("Clear chat memory in this channel"),
  new SlashCommandBuilder()
    .setName("persona")
    .setDescription("Manage the persona")
    .addSubcommand((sc) =>
      sc.setName("set").setDescription("Set persona prompt")
        .addStringOption((opt) => opt.setName("prompt").setDescription("Persona/system prompt").setRequired(true))
    )
    .addSubcommand((sc) => sc.setName("view").setDescription("View current persona"))
    .addSubcommand((sc) => sc.setName("reset").setDescription("Reset persona to default")),
  new SlashCommandBuilder()
    .setName("model")
    .setDescription("Choose/view the Gemini model")
    .addSubcommand((sc) =>
      sc.setName("set").setDescription("Set model name")
        .addStringOption((opt) => opt.setName("name").setDescription("e.g. gemini-1.5-flash").setRequired(true))
    )
    .addSubcommand((sc) => sc.setName("view").setDescription("View current model")),
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
