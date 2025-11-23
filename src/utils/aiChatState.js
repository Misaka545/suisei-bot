const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const chatSessions = new Map(); // Map<channelId, { persona, memory, model, history[] }>
const MAX_HISTORY_PAIRS = 8;

function defaultPersona() {
  return "You are Suisei, a playful yet helpful anime-styled assistant in a Discord server. Speak concisely (<=120 words unless asked), use a friendly tone, and support English or Vietnamese depending on the user's message. Avoid overstepping.";
}

function ensureChat(channelId) {
  let s = chatSessions.get(channelId);
  if (!s) {
    s = {
      persona: defaultPersona(),
      memory: [],
      model: DEFAULT_GEMINI_MODEL,
      history: [],
      lang: "auto", 
    };
    chatSessions.set(channelId, s);
  }
  return s;
}

function pushHistory(session, role, content) {
  session.history.push({ role, content });
  const max = MAX_HISTORY_PAIRS * 2;
  if (session.history.length > max) {
    session.history.splice(0, session.history.length - max);
  }
}

function toGeminiHistory(session) {
  // discord-style → Gemini chat format
  return session.history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function systemInstructionFor(session) {
  const bits = [session.persona];
  if (session.memory.length) bits.push("Long-term facts:\n- " + session.memory.join("\n- "));
  return bits.join("\n\n");
}

async function aiGenerate(session, userMsg) {
  const modelName = session.model || DEFAULT_GEMINI_MODEL;

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemInstructionFor(session),
  });

  const chat = model.startChat({
    history: toGeminiHistory(session),
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 512,
    },
  });

  const res = await chat.sendMessage(userMsg);
  const text = res?.response?.text?.() || "";

  pushHistory(session, "user", userMsg);
  pushHistory(session, "assistant", text);

  return text;
}

module.exports = {
  ensureChat,
  aiGenerate,
  defaultPersona,
};
