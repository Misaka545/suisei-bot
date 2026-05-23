const gachaData = new Map(); // Map<userId, userData>

function ensureUser(userId) {
  if (!gachaData.has(userId)) {
    gachaData.set(userId, {
      history: [], // Stores every single pull object
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
}

module.exports = {
  ensureUser,
  addToHistory,
  gachaData,
};