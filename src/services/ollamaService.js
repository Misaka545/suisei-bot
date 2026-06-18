// src/services/ollamaService.js

const fetch = global.fetch || ((...a) => import("node-fetch").then(({ default: f }) => f(...a)));

const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3.6:35b";

/**
 * Generate a chat response via Ollama (OpenAI-compatible /api/chat).
 * @param {string} systemPrompt - system instruction
 * @param {{ role: string, content: string }[]} history - conversation history
 * @param {string} userMsg - the latest user message
 * @returns {Promise<string>} the model's reply text
 */
async function ollamaChat(systemPrompt, history, userMsg) {
  const messages = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  messages.push({ role: "user", content: userMsg });

  const res = await (await fetch)(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.95,
        top_k: 40,
        num_predict: 2048,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  return (json?.message?.content || "").trim();
}

/**
 * Transcribe audio via Ollama using Qwen's multimodal capabilities.
 * Falls back to a simple "cannot transcribe" message if the model
 * doesn't support audio input.
 * @param {Buffer} wavBuffer - WAV audio buffer
 * @returns {Promise<string>} transcribed text
 */
async function ollamaTranscribe(wavBuffer) {
  // Qwen 3.6 35B is a text model — it cannot process raw audio.
  // Return empty so the caller knows transcription wasn't possible.
  console.warn("[Ollama STT] Qwen 3.6 35B does not support audio input — skipping transcription.");
  return "";
}

/**
 * Check if Ollama is reachable.
 * @returns {Promise<boolean>}
 */
async function isOllamaAvailable() {
  try {
    const res = await (await fetch)(`${OLLAMA_BASE}/api/tags`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { ollamaChat, ollamaTranscribe, isOllamaAvailable, OLLAMA_MODEL };
