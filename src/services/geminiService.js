// src/services/geminiService.js
const fetch = global.fetch || ((...a)=>import('node-fetch').then(({default:f})=>f(...a)));
const API_KEY = process.env.GOOGLE_API_KEY;

// Prefer 2.0 Flash, then other working fallbacks
const PREFERRED_STT_MODELS = [
  process.env.STT_MODEL,            // allow override via .env
  "gemini-2.0-flash",               // your preferred choice
  "gemini-2.0-flash-lite",          // if your project has only lite
  "gemini-1.5-flash-latest",        // older but reliable
  "gemini-1.5-flash",
  "gemini-1.5-pro-latest"
].filter(Boolean);

function normalizeModel(name = "") {
  const n = name.trim().toLowerCase();
  if (!n) return "";
  if (n === "2.0-flash" || n === "gemini-2.0") return "gemini-2.0-flash";
  if (n === "gemini-pro") return "gemini-1.5-pro-latest";
  if (n === "1.5-flash") return "gemini-1.5-flash-latest";
  return name;
}

async function callGeminiV1GenerateContent(model, wavBuffer) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{
      role: "user",
      parts: [
        { text: "Transcribe the audio. Detect the language. Return only the spoken words." },
        { inline_data: { mime_type: "audio/wav", data: wavBuffer.toString("base64") } }
      ]
    }]
  };
  const res = await (await fetch)(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(()=> "");
    const e = new Error(`HTTP ${res.status} ${res.statusText}: ${err.slice(0,300)}`);
    e.status = res.status; throw e;
  }
  const json = await res.json();
  const cand = json?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  return parts.map(p => p.text || "").join("").trim();
}

async function geminiTranscribe(wavBuffer) {
  if (!API_KEY) throw new Error("Missing GOOGLE_API_KEY");
  if (!wavBuffer?.length) return "";
  let lastErr;
  const tried = new Set();
  for (const raw of PREFERRED_STT_MODELS) {
    const m = normalizeModel(raw);
    if (!m || tried.has(m)) continue;
    tried.add(m);
    try {
      const text = await callGeminiV1GenerateContent(m, wavBuffer);
      if (text) {
        if (m !== process.env.STT_MODEL) console.log(`[STT] Using model: ${m}`);
        return text;
      }
      console.warn(`[STT] model ${m} returned empty text, trying next…`);
    } catch (e) {
      const msg = e?.message || String(e);
      if (e?.status === 404 || /not found|unknown model|unsupported/i.test(msg)) {
        console.warn(`[STT] model ${m} not available, trying next…`);
        lastErr = e; continue;
      }
      console.error(`[STT] model ${m} failed:`, msg);
      lastErr = e; continue;
    }
  }
  throw lastErr || new Error("STT failed for all models");
}

module.exports = { geminiTranscribe };
