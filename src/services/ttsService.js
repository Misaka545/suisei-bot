const { PassThrough, Readable } = require("stream");
const { createAudioResource, StreamType } = require("@discordjs/voice");
const https = require("https");
const prism = require("prism-media");
const ffmpegPath = require("ffmpeg-static");

function ttsGoogleResource(text, langCode = "en") {
  let gTTS;
  try { gTTS = require("google-tts-api"); }
  catch (_) { throw new Error("google-tts-api not installed. npm i google-tts-api"); }

  const url = gTTS.getAudioUrl(text, { lang: langCode === "auto" ? "en" : langCode, slow: false });
  const pass = new PassThrough();
  https.get(url, (res) => res.pipe(pass)).on("error", (e) => pass.destroy(e));

  const ff = new prism.FFmpeg({
    command: ffmpegPath,
    args: ["-i","pipe:0","-f","webm","-acodec","libopus","-ar","48000","-ac","2","-b:a","96k","-loglevel","quiet","pipe:1"],
  });
  const stream = pass.pipe(ff);
  return createAudioResource(stream, { inputType: StreamType.WebmOpus, inlineVolume: false, highWaterMark: 1<<25 });
}

async function ttsElevenResource(text) {
  const apiKey = process.env.ELEVEN_API_KEY;
  const voiceId = process.env.ELEVEN_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error("Missing ELEVEN_API_KEY / ELEVEN_VOICE_ID");
  const fetch =
    global.fetch || ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);

  const nodeReadable = Readable.fromWeb(res.body);
  const ff = new prism.FFmpeg({
    command: ffmpegPath,
    args: ["-i","pipe:0","-f","webm","-acodec","libopus","-ar","48000","-ac","2","-b:a","96k","-loglevel","quiet","pipe:1"],
  });
  const transcoded = nodeReadable.pipe(ff);
  return createAudioResource(transcoded, { inputType: StreamType.WebmOpus, inlineVolume: false, highWaterMark: 1<<25 });
}

async function ttsResourceFromText(text, langCode = "auto") {
  let provider = (process.env.TTS_PROVIDER || "").toLowerCase();
  if (!provider) provider = process.env.ELEVEN_API_KEY ? "elevenlabs" : "google";
  if (provider === "elevenlabs") return ttsElevenResource(text);
  return ttsGoogleResource(text, langCode);
}

module.exports = { ttsResourceFromText };
