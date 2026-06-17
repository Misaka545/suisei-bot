// src/services/voicevoxService.js
// VOICEVOX REST API client for Text-to-Speech synthesis

const { Readable } = require("stream");
const { spawn } = require("child_process");
const { createAudioResource, StreamType } = require("@discordjs/voice");
const { getFfmpegPath } = require("../utils/audioProcessing");

const VOICEVOX_URL = process.env.VOICEVOX_URL || "http://127.0.0.1:50021";

/**
 * Check if the VOICEVOX engine is available.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  try {
    const res = await fetch(`${VOICEVOX_URL}/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get the list of available speakers from VOICEVOX.
 * @returns {Promise<Array<{name: string, styles: Array<{name: string, id: number}>}>>}
 */
async function listSpeakers() {
  const res = await fetch(`${VOICEVOX_URL}/speakers`);
  if (!res.ok) {
    throw new Error(`VOICEVOX /speakers failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Create an audio query from text.
 * Step 1 of the VOICEVOX 2-step synthesis flow.
 * @param {string} text - Text to synthesize
 * @param {number} speakerId - VOICEVOX speaker/style ID
 * @returns {Promise<object>} Audio query JSON
 */
async function createAudioQuery(text, speakerId) {
  const url = new URL("/audio_query", VOICEVOX_URL);
  url.searchParams.set("speaker", speakerId);
  url.searchParams.set("text", text);

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`VOICEVOX /audio_query failed: ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Synthesize audio from an audio query.
 * Step 2 of the VOICEVOX 2-step synthesis flow.
 * Returns raw WAV data (24kHz, 16-bit, mono).
 * @param {object} audioQuery - Audio query JSON from createAudioQuery
 * @param {number} speakerId - VOICEVOX speaker/style ID
 * @returns {Promise<Buffer>} WAV audio buffer
 */
async function synthesisFromQuery(audioQuery, speakerId) {
  const url = new URL("/synthesis", VOICEVOX_URL);
  url.searchParams.set("speaker", speakerId);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(audioQuery),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`VOICEVOX /synthesis failed: ${res.status} — ${body.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Convert WAV buffer (24kHz mono) to PCM stream (48kHz stereo) for Discord.
 * @param {Buffer} wavBuffer - WAV audio from VOICEVOX
 * @returns {import("stream").Readable} PCM stream
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

  ff.stdin.on("error", () => {}); // Ignore EPIPE if ffmpeg closes early

  return ff.stdout;
}

/**
 * Full synthesis pipeline: text → VOICEVOX → WAV → PCM → AudioResource
 * @param {string} text - Text to speak
 * @param {number} speakerId - VOICEVOX speaker/style ID
 * @returns {Promise<import("@discordjs/voice").AudioResource>}
 */
async function synthesize(text, speakerId = 3) {
  if (!text || !text.trim()) throw new Error("Empty text for VOICEVOX synthesis");

  console.log(`[VOICEVOX] Synthesizing (speaker=${speakerId}): "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`);

  // Step 1: Create audio query
  const audioQuery = await createAudioQuery(text, speakerId);

  // Optional: adjust speed/pitch here by modifying audioQuery
  // audioQuery.speedScale = 1.1;
  // audioQuery.pitchScale = 0.0;

  // Step 2: Synthesize WAV
  const wavBuffer = await synthesisFromQuery(audioQuery, speakerId);

  // Step 3: Convert to Discord-compatible PCM stream
  const pcmStream = wavToPcmStream(wavBuffer);

  // Step 4: Create AudioResource
  return createAudioResource(pcmStream, {
    inputType: StreamType.Raw,
    inlineVolume: true,
  });
}

module.exports = {
  isAvailable,
  listSpeakers,
  createAudioQuery,
  synthesisFromQuery,
  synthesize,
};
