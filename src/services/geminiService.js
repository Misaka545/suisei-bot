const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function geminiTranscribe(wavBuffer, tryModels = []) {
  if (!wavBuffer?.length) return "";
  const payload = [
    { text: "Transcribe the audio. Detect the language. Return only the words spoken, no extra commentary." },
    { inlineData: { data: wavBuffer.toString("base64"), mimeType: "audio/wav" } },
  ];

  const candidates = tryModels.length
    ? tryModels
    : [process.env.STT_MODEL || "gemini-1.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

  let lastErr;
  for (const m of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const res = await model.generateContent(payload);
      const text = res?.response?.text?.().trim() || "";
      if (text) return text;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr || new Error("STT failed");
}

function systemInstructionFor(session) {
  const bits = [session.persona];
  if (session.memory?.length) bits.push("Long-term facts:\n- " + session.memory.join("\n- "));
  return bits.join("\n\n");
}

async function aiGenerate(session, userMsg) {
  const modelName = session.model || process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemInstructionFor(session),
  });
  const history = session.history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const chat = model.startChat({
    history,
    generationConfig: { temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 512 },
  });
  const res = await chat.sendMessage(userMsg);
  return res?.response?.text?.() || "…";
}

module.exports = { geminiTranscribe, aiGenerate };
