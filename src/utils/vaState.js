const vaState = new Map(); // Map<guildId, { active, lang, wakeword, processing }>

function ensureVA(guildId) {
  let s = vaState.get(guildId);
  if (!s) {
    s = { active: false, lang: "auto", wakeword: null, processing: false };
    vaState.set(guildId, s);
  }
  return s;
}

module.exports = { ensureVA };
