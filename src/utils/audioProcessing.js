const prism = require("prism-media");
const path = require("path"); // path module is useful but might not be strictly needed if using 'ffmpeg' directly
const fs = require("fs");   // fs module is useful for checking if a path exists

// --- Start of FFmpeg Path Configuration ---
// This is the crucial part that was missing or incorrect.
let staticFfmpeg = null;
try {
  staticFfmpeg = require("ffmpeg-static");
} catch {}

let _ffmpegPath = process.env.FFMPEG_PATH || staticFfmpeg || 'ffmpeg';
console.log(`[FFmpeg] Using command: ${_ffmpegPath}`);

function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) {
    if (fs.existsSync(process.env.FFMPEG_PATH)) {
      return process.env.FFMPEG_PATH;
    }
    console.error(`[FFmpeg] ERROR: Configured FFMPEG_PATH does not exist: ${process.env.FFMPEG_PATH}`);
  }
  if (staticFfmpeg && fs.existsSync(staticFfmpeg)) {
    return staticFfmpeg;
  }
  return 'ffmpeg';
}
// --- End of FFmpeg Path Configuration ---


// WAV header (48k mono, s16le)
function pcmToWav48kMono(pcmBuffer) {
  const numChannels = 1;
  const sampleRate = 48000;
  const bitsPerSample = 16;

  const byteRate = (sampleRate * numChannels * bitsPerSample) >> 3;
  const blockAlign = (numChannels * bitsPerSample) >> 3;
  const dataSize = pcmBuffer.length;
  const chunkSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function makeOpusDecoderMono48k() {
  const decoder = new prism.opus.Decoder({
    frameSize: 960, // 20ms @ 48k
    channels: 1,
    rate: 48000,
  });
  return decoder;
}

const { Readable } = require("stream");
const { spawn } = require("child_process");

/**
 * Convert WAV buffer to PCM stream (48kHz stereo) for Discord voice playback.
 * @param {Buffer} wavBuffer
 * @returns {import("stream").Readable}
 */
function wavToPcmStream(wavBuffer) {
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) throw new Error("FFmpeg not found");

  const ff = spawn(ffmpeg, [
    "-i", "pipe:0",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });

  const readable = Readable.from(wavBuffer);
  readable.pipe(ff.stdin);

  ff.stdin.on("error", () => {});
  ff.on("error", (err) => {
    console.error("[FFmpeg process error]", err.message);
  });
  ff.stdout.on("error", (err) => {
    console.warn("[FFmpeg stdout error]", err.message);
  });

  return ff.stdout;
}

module.exports = { pcmToWav48kMono, makeOpusDecoderMono48k, getFfmpegPath, wavToPcmStream };