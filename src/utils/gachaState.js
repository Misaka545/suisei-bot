const gachaData = new Map(); // Map<userId, userData>
const MAX_HISTORY_PER_USER = 100;

function ensureUser(userId) {
  if (!gachaData.has(userId)) {
    gachaData.set(userId, {
      history: [], // Stores recent pull objects
      pity: {
        character_featured: 0,
        weapon_featured: 0,
        character_standard: 0,
        weapon_standard: 0,
      },
      pity_4: {
        character_featured: 0,
        weapon_featured: 0,
        character_standard: 0,
        weapon_standard: 0,
      },
      guarantee: {
        character_featured: false,
        weapon_featured: true,
      }
    });
  }
  return gachaData.get(userId);
}

function addToHistory(userId, pullResult) {
  const user = ensureUser(userId);
  user.history.push(pullResult);
  if (user.history.length > MAX_HISTORY_PER_USER) {
    user.history.splice(0, user.history.length - MAX_HISTORY_PER_USER);
  }
}

module.exports = {
  ensureUser,
  addToHistory,
  gachaData,
};