// src/services/ttsService.js
const https = require("https");
const { Readable, PassThrough } = require("stream");
const prism = require("prism-media");
const { createAudioResource, StreamType } = require("@discordjs/voice");
const { ffmpegPath } = require("../utils/audioProcessing");

// ---- helpers ---------------------------------------------------------------
function httpStream(url) {
  const pass = new PassThrough({ highWaterMark: 1 << 20 });
  const req = https.get(url, (res) => res.pipe(pass));
  req.on("error", (e) => pass.destroy(e));
  return pass;
}

function buildOpusOgg(readable, tag = "tts") {
  const ff = new prism.FFmpeg({
    command: ffmpegPath,
    args: [
      "-hide_banner",
      "-loglevel", "error",
      "-i", "pipe:0",
      "-f", "ogg",
      "-c:a", "libopus",
      "-ar", "48000",
      "-ac", "2",
      "-b:a", "96k",
      "-application", "voip",
      "pipe:1",
    ],
  });

  // nuốt lỗi đường ống đóng sớm để tránh crash (EPIPE)
  readable.on("error", (e) => {
    console.warn(`[TTS] ${tag} upstream error:`, e?.message || e);
    ff.destroy(e);
  });
  ff.on("error", (e) => console.warn("[TTS] ffmpeg error:", e?.message || e));
  ff.stdout?.on?.("error", (e) => console.warn("[TTS] ffmpeg stdout:", e?.message || e));
  ff.stdin?.on?.("error", (e) => console.warn("[TTS] ffmpeg stdin:", e?.message || e));

  return readable.pipe(ff);
}

async function toDiscordResourceFromReadable(readable, label = "tts") {
  return createAudioResource(readable, {
    inputType: StreamType.OggOpus,
    inlineVolume: false,
    highWaterMark: 1 << 25,
    metadata: { label },
  });
}

// ---- Google TTS (fallback) -------------------------------------------------
// google-tts-api v2: module.exports(text, { lang, slow, host }) => [{ url, shortText }, ...]
function googleTTSResource(text, langCode = "en") {
  let gTTS;
  try {
    gTTS = require("google-tts-api");
  } catch {
    throw new Error("google-tts-api is not installed. npm i google-tts-api");
  }

  // đảm bảo lang là string
  const lang = (langCode && typeof langCode === "string" ? langCode : "en").toLowerCase();
  const urls = gTTS(text, { lang, slow: false, host: "https://translate.google.com" });
  if (!Array.isArray(urls) || !urls.length) throw new Error("google-tts-api returned no urls");

  const src = httpStream(urls[0].url);                 // mp3
  const ogg = buildOpusOgg(src, "google");             // -> ogg/opus
  return toDiscordResourceFromReadable(ogg, "google-tts");
}

// ---- ElevenLabs TTS (primary) ---------------------------------------------
async function elevenLabsResource(text) {
  const apiKey = process.env.ELEVEN_API_KEY;
  const voiceId = process.env.ELEVEN_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error("Missing ELEVEN_API_KEY / ELEVEN_VOICE_ID");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
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
    }
  );

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${msg}`);
  }

  const readable = Readable.fromWeb(res.body);   // mpeg
  const ogg = buildOpusOgg(readable, "eleven");  // -> ogg/opus
  return toDiscordResourceFromReadable(ogg, "elevenlabs-tts");
}

// ---- unified ---------------------------------------------------------------
async function ttsResourceFromText(text, langCode = "auto") {
  // nếu có ELEVEN_API_KEY, dùng eleven trước
  const prefer = (process.env.TTS_PROVIDER || "").toLowerCase();
  const has11 = !!process.env.ELEVEN_API_KEY && !!process.env.ELEVEN_VOICE_ID;

  const tryElevenFirst = prefer ? prefer === "elevenlabs" : has11;

  if (tryElevenFirst) {
    try {
      return await elevenLabsResource(text);
    } catch (e) {
      console.warn("[TTS] primary provider failed, fallback to Google:", e?.message || e);
      // fallthrough → Google
    }
  }
  // Google fallback
  const pickLang = langCode && langCode !== "auto" ? langCode : "en";
  return await googleTTSResource(text, pickLang);
}

module.exports = {
  ttsResourceFromText,
};
