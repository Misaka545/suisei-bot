const chatSessions = new Map(); // Map<channelId, { persona, memory, model, history[] }>
const MAX_HISTORY = 8;

function defaultPersona() {
  return "You are Suisei, a playful yet helpful anime-styled assistant in a Discord server. Speak concisely (<=120 words unless asked), use a friendly tone, and support English or Vietnamese depending on the user's message. Avoid overstepping.";
}

function ensureChat(channelId, defaultModel) {
  let s = chatSessions.get(channelId);
  if (!s) {
    s = { persona: defaultPersona(), memory: [], model: defaultModel, history: [] };
    chatSessions.set(channelId, s);
  }
  return s;
}

function pushHistory(session, role, content) {
  session.history.push({ role, content });
  const max = MAX_HISTORY * 2;
  if (session.history.length > max) session.history.splice(0, session.history.length - max);
}

module.exports = { ensureChat, pushHistory, defaultPersona };
