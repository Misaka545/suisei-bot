// src/services/geminiService.js
const fetch = global.fetch || ((...a)=>import('node-fetch').then(({default:f})=>f(...a)));
const API_KEY = process.env.GOOGLE_API_KEY;

const PREFERRED_STT_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash"
].filter(Boolean);

function normalizeModel(name = "") {
  return name.trim();
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
      if (e?.status === 429 || /quota|rate limit/i.test(msg)) {
        console.warn(`[STT] model ${m} is out of quota (Rate Limited), falling back to next model...`);
        lastErr = e; continue;
      }
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
