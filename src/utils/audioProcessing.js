const prism = require("prism-media");
const path = require("path"); // path module is useful but might not be strictly needed if using 'ffmpeg' directly
const fs = require("fs");   // fs module is useful for checking if a path exists

// --- Start of FFmpeg Path Configuration ---
// This is the crucial part that was missing or incorrect.
let _ffmpegPath = 'C:\\ffmpeg\\ffmpeg-8.0-full_build\\bin\\ffmpeg.exe';
// On Windows, if FFmpeg is in your system's PATH, 'ffmpeg' is usually enough.
// If you want to specify a full path (e.g., if ffmpeg.exe is in a specific folder
// and not in your PATH), you would set process.env.FFMPEG_PATH or hardcode it here.
// Example for a specific path:
// let _ffmpegPath = 'C:\\ffmpeg\\bin\\ffmpeg.exe'; // <-- Adjust this if needed

// You can add more robust checks here if 'ffmpeg' alone doesn't work.
// For now, given 'ffmpeg -version' works, we'll rely on the system PATH.
console.log(`[FFmpeg] Using command: ${_ffmpegPath}`);

function getFfmpegPath() {
  // Add a check to confirm existence
  if (!fs.existsSync(_ffmpegPath)) {
    console.error(`[FFmpeg] ERROR: Configured FFmpeg path does not exist: ${_ffmpegPath}`);
    return null; // Or throw an error immediately
  }
  return _ffmpegPath;
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

module.exports = { pcmToWav48kMono, makeOpusDecoderMono48k, getFfmpegPath }; // Export the new function