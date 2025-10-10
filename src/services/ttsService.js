// src/services/ttsService.js — FULL IMPLEMENTATION with PCM pipeline and undeafen
// ---------------------------------------------------------------------------
// Converts text → audio using ElevenLabs or Google TTS, transcodes to PCM 48 kHz,
// joins a voice channel (ensuring bot is not deafened/muted) and plays the audio.
// ---------------------------------------------------------------------------

const https = require("https");
const { Readable, PassThrough } = require("stream");
const { spawn } = require("child_process");
const {
  createAudioResource,
  StreamType,
  joinVoiceChannel,
  entersState,
  createAudioPlayer,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  AudioPlayerStatus,
} = require("@discordjs/voice");
const { ChannelType } = require("discord.js");
const { getFfmpegPath } = require("../utils/audioProcessing");

let _player = null;
function getPlayer() {
  if (_player) return _player;
  _player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
  _player.on("error", (err) => console.error("[AudioPlayer error]", err?.message || err));
  _player.on(AudioPlayerStatus.Idle, () => console.log("[TTS] player idle"));
  _player.on(AudioPlayerStatus.Playing, () => console.log("[TTS] player playing"));
  _player.on(AudioPlayerStatus.Buffering, () => console.log("[TTS] player buffering"));
  return _player;
}

function httpStream(url) {
  const pass = new PassThrough({ highWaterMark: 1 << 20 });
  const req = https.get(url, (res) => {
    console.log(`[TTS] HTTP Stream for ${url.slice(0, 50)}... Status: ${res.statusCode}`);
    if (res.statusCode >= 400) {
        // Read response body for better error message from server
        let errorBody = '';
        res.on('data', chunk => errorBody += chunk);
        res.on('end', () => {
            pass.destroy(new Error(`HTTP Error ${res.statusCode} for ${url.slice(0, 50)}... Body: ${errorBody.slice(0, 200)}`));
        });
        return;
    }
    res.pipe(pass);
  });
  req.on("error", (e) => pass.destroy(e));
  return pass;
}

function toDiscordResourceFromReadable(readable, label = "tts") {
  return createAudioResource(readable, {
    inputType: StreamType.Raw, // We are providing raw PCM (s16le) here
    inlineVolume: true,
    highWaterMark: 1 << 25,
    metadata: { label },
  });
}

function buildPcm48kS16le(readable, tag = "tts") {
  const ffmpegExecutable = getFfmpegPath();

  if (!ffmpegExecutable) {
    throw new Error("FFmpeg executable path is not defined. Please check FFMPEG_PATH in your .env or audioProcessing.js");
  }

  // FFmpeg arguments:
  // -hide_banner, -loglevel error: reduce console spam
  // -i pipe:0: input from stdin
  // -f mp3: input format is mp3 (crucial for ElevenLabs/Google TTS)
  // -f s16le: output format is signed 16-bit little-endian PCM
  // -ar 48000: output sample rate 48kHz
  // -ac 2: output 2 channels (stereo, Discord voice supports stereo PCM)
  // pipe:1: output to stdout
  const ffmpegArgs = [
    "-hide_banner",
    "-loglevel", "error",
    "-f", "mp3",
    "-i", "pipe:0",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2", // Discord voice accepts stereo PCM
    "pipe:1",
  ];

  console.log(`[TTS] Starting FFmpeg with: ${ffmpegExecutable} ${ffmpegArgs.join(" ")}`);

  const ff = spawn(ffmpegExecutable, ffmpegArgs, {
    stdio: ['pipe', 'pipe', 'inherit'], // Use 'inherit' for stderr to see FFmpeg's errors directly
  });

  ff.on('error', (err) => {
      console.error(`[TTS] FFmpeg child process SPANNING ERROR (${tag}): ${err.message}`);
      if (err.code === 'ENOENT') {
          console.error(`  FFmpeg executable not found at: ${ffmpegExecutable}. This should NOT happen if ffmpeg -version works.`);
      } else if (err.code === 'EACCES') {
          console.error(`  Permission denied to execute FFmpeg. Check file permissions or antivirus.`);
      }
      readable.destroy(err);
      ff.stdout?.destroy(err);
  });

  if (!ff.stdin) { // This check should now pass if spawn is successful
    throw new Error(`FFmpeg child process stdin is not available for ${tag}. This indicates a critical spawn failure.`);
  }
  readable.pipe(ff.stdin);

  ff.stderr?.on('data', (data) => {
    console.error(`[TTS] FFmpeg STDERR (${tag}): ${data.toString().trim()}`);
  });
  ff.stderr?.on('end', () => {
    console.log(`[TTS] FFmpeg STDERR (${tag}): ended`);
  });
  ff.stderr?.on('error', (e) => {
    console.error(`[TTS] FFmpeg STDERR pipe error (${tag}): ${e.message}`);
  });

  ff.stdin?.on?.("error", (e) => console.warn("[TTS] ffmpeg stdin error:", e?.message || e));
  ff.stdout?.on?.("error", (e) => console.warn("[TTS] ffmpeg stdout error:", e?.message || e));

  let stdoutDataCount = 0;
  ff.stdout?.on?.('data', (chunk) => {
        stdoutDataCount += chunk.length;
        if (stdoutDataCount < 5000) {
            // console.log(`[TTS] FFmpeg stdout received ${chunk.length} bytes (total: ${stdoutDataCount})`);
        } else if (stdoutDataCount % 50000 === 0) { // Log less frequently for large streams
             console.log(`[TTS] FFmpeg stdout total received ${stdoutDataCount} bytes`);
        }
  });
  ff.stdout?.on?.('end', () => {
      console.log(`[TTS] FFmpeg stdout ended. Total PCM bytes: ${stdoutDataCount}`);
      if (stdoutDataCount === 0) {
          console.error("[TTS] FFmpeg produced 0 bytes of PCM audio. This is usually a problem.");
      }
  });

  ff.on('close', (code, signal) => {
    console.log(`[TTS] FFmpeg process **closed** with code ${code} and signal ${signal}`);
    if (code !== 0 && code !== null) {
        console.error("[TTS] FFmpeg process exited with a non-zero code. Possible error in input or FFmpeg setup.");
    }
  });
  ff.on('exit', (code, signal) => {
    console.log(`[TTS] FFmpeg process **exited** with code ${code} and signal ${signal}`);
  });
  // The 'error' event on the child process itself catches spawn errors
  ff.on('error', (err) => {
    console.error(`[TTS] FFmpeg child process **error event (child_process.spawn)**: ${err.message}`);
    if (err.code === 'ENOENT') {
        console.error("  FFmpeg executable not found. This should not happen if path is correct.");
    }
    // Also destroy the output stream if an error occurs during spawn or execution
    readable.destroy(err);
    ff.stdout?.destroy(err); // Ensure output stream is also cleaned up
  });

 return ff.stdout; // Return the stdout stream from FFmpeg
}

// -----------------------------
// Google TTS (fallback) - MANUAL URL GENERATION
function googleTTSResource(text, langCode) {
  console.log(`[TTS] Using Google TTS for text: "${text.slice(0, 50)}..." (lang: ${langCode})`);

  // Google TTS URL format
  const encodedText = encodeURIComponent(text);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${langCode}&total=1&idx=0&textlen=${text.length}&client=tw-ob`;

  const src = httpStream(url);
  const pcm = buildPcm48kS16le(src, "google");
  return toDiscordResourceFromReadable(pcm, "google-tts");
}

// -----------------------------
// ElevenLabs (primary)
async function elevenLabsResource(text) {
  const apiKey = process.env.ELEVEN_API_KEY;
  const voiceId = process.env.ELEVEN_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error("Missing ELEVEN_API_KEY / ELEVEN_VOICE_ID");

  console.log(`[TTS] Using ElevenLabs for text: "${text.slice(0, 50)}..."`);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: "POST",
        headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg", // Expecting MP3
        },
        body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.8,
                style: 0.0,
                use_speaker_boost: true,
            },
        }),
    });

    if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(`ElevenLabs ${res.status}: ${errorBody.slice(0, 300)}`);
    }

    if (!res.body) {
        throw new Error("ElevenLabs response body is empty or not a readable stream.");
    }

    let readable;
    // Node.js v16+ (or newer) provides Readable.fromWeb for fetch streams
    // Node.js v18+ global fetch returns a web stream, which can be converted.
    if (res.body instanceof Readable) {
      // Already a Node.js Readable stream
      readable = res.body;
    } else if (res.body && typeof res.body[Symbol.asyncIterator] === 'function') {
        // Node.js native ReadableStream (async iterable), can be consumed directly or via Readable.from
        readable = Readable.from(res.body);
    } else if (res.body.getReader && typeof res.body.getReader === 'function') {
        // Standard Web ReadableStream, convert using Readable.fromWeb (Node.js 16.5+)
        readable = Readable.fromWeb(res.body);
    } else {
        throw new Error("ElevenLabs response body is not a recognizable stream type.");
    }

    let readableBytesCount = 0;
    readable.on('data', (chunk) => {
        readableBytesCount += chunk.length;
        if (readableBytesCount < 5000) {
            // console.log(`[TTS] ElevenLabs readable stream received ${chunk.length} bytes (total: ${readableBytesCount})`);
        } else if (readableBytesCount % 50000 === 0) { // Log less frequently
            console.log(`[TTS] ElevenLabs readable stream total received ${readableBytesCount} bytes`);
        }
    });
    readable.on('end', () => {
        console.log(`[TTS] ElevenLabs readable stream ended. Total bytes: ${readableBytesCount}`);
        if (readableBytesCount === 0) {
            console.error("[TTS] ElevenLabs stream provided 0 bytes of data!");
        }
    });
    readable.on('error', (e) => {
        console.error(`[TTS] ElevenLabs readable stream error: ${e.message}`);
    });

    console.log("[TTS] ElevenLabs Stream created. Type:", readable instanceof Readable ? "Node.js Readable" : "Web Readable (converted)");

    const pcm = buildPcm48kS16le(readable, "eleven");
    return toDiscordResourceFromReadable(pcm, "elevenlabs-tts");
}

// -----------------------------
// Unified builder
async function ttsResourceFromText(text, langCode = "auto") {
  const prefer = (process.env.TTS_PROVIDER || "").toLowerCase();
  const has11 = !!process.env.ELEVEN_API_KEY && !!process.env.ELEVEN_VOICE_ID;
  const tryElevenFirst = prefer ? prefer === "elevenlabs" : has11;

  const pickLang = (langCode && langCode !== "auto" && typeof langCode === 'string' && langCode.length > 0) ? langCode : "en";

  if (tryElevenFirst) {
    try {
      return await elevenLabsResource(text);
    } catch (e) {
      console.warn("[TTS] primary provider (ElevenLabs) failed, fallback to Google:", e?.message || e);
    }
  }
  // If ElevenLabs failed or not preferred, try Google TTS
  try {
    return await googleTTSResource(text, pickLang);
  } catch (e) {
    console.error("[TTS] Google TTS also failed:", e?.message || e);
    throw e; // Re-throw if both failed
  }
}

// -----------------------------
// Connection (auto-undeafen)
async function ensureConnection(voiceChannel) {
  if (!voiceChannel) throw new Error("User not in a voice channel.");

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false, // Ensure selfMute is false for speaking
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

  const me = voiceChannel.guild.members.me;
  try {
    if (me?.voice?.selfDeaf) {
        console.log("[TTS] Undeafening bot (selfDeaf).");
        await me.voice.setSelfDeaf(false);
    }
    if (me?.voice?.selfMute) {
        console.log("[TTS] Unmuting bot (selfMute).");
        await me.voice.setSelfMute(false);
    }
    // These require server permissions, might not always work but good to try
    if (me?.voice?.serverDeaf) {
        console.log("[TTS] Undeafening bot (serverDeaf).");
        await me.voice.setDeaf(false);
    }
    if (me?.voice?.serverMute) {
        console.log("[TTS] Unmuting bot (serverMute).");
        await me.voice.setMute(false);
    }
    if (voiceChannel.type === ChannelType.GuildStageVoice) {
      if (me?.voice?.suppress) {
          console.log("[TTS] Unsuppressing bot for stage channel.");
          await me.voice.setSuppressed(false); // Ensure unsuppress for stage channels
      }
    }
  } catch (e) {
    console.warn("[TTS] cannot clear deaf/mute/suppress (might lack permissions):", e?.message || e);
  }

  connection.subscribe(getPlayer());
  return connection;
}

// -----------------------------
// Playback wrappers
async function speakResourceToChannel(voiceChannel, resource) {
  await ensureConnection(voiceChannel);
  const player = getPlayer();
  if (resource.volume) resource.volume.setVolume(0.85);
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 5_000);
  console.log("[TTS] Playing to voice channel:", voiceChannel?.name);
}

async function speakTextToChannel(voiceChannel, text, lang = "auto") {
  const resource = await ttsResourceFromText(text, lang);
  await speakResourceToChannel(voiceChannel, resource);
}

module.exports = {
  ttsResourceFromText,
  speakTextToChannel,
  speakResourceToChannel,
};