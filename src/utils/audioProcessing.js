const prism = require("prism-media");

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

module.exports = { pcmToWav48kMono, makeOpusDecoderMono48k };
