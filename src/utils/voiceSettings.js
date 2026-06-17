// src/utils/voiceSettings.js
// Per-guild settings: VOICEVOX speaker + response language

const fs = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(__dirname, "..", "..", "data", "voiceSettings.json");
const DEFAULT_SPEAKER_ID = parseInt(process.env.VOICEVOX_SPEAKER_ID, 10) || 3;

// Map<guildId, { speakerId: number }>
const guildSettings = new Map();

// Load settings from disk
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      for (const [guildId, settings] of Object.entries(data)) {
        guildSettings.set(guildId, settings);
      }
      console.log(`[VoiceSettings] Loaded settings for ${guildSettings.size} guild(s).`);
    }
  } catch (e) {
    console.warn("[VoiceSettings] Could not load settings:", e.message);
  }
}

// Save settings to disk
function saveSettings() {
  try {
    const obj = Object.fromEntries(guildSettings);
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2), "utf-8");
  } catch (e) {
    console.warn("[VoiceSettings] Could not save settings:", e.message);
  }
}

/**
 * Get the VOICEVOX speaker ID for a guild.
 * @param {string} guildId
 * @returns {number}
 */
function getSpeakerId(guildId) {
  const settings = guildSettings.get(guildId);
  return settings?.speakerId ?? DEFAULT_SPEAKER_ID;
}

/**
 * Set the VOICEVOX speaker ID for a guild.
 * @param {string} guildId
 * @param {number} speakerId
 */
function setSpeakerId(guildId, speakerId) {
  let settings = guildSettings.get(guildId);
  if (!settings) {
    settings = { speakerId: DEFAULT_SPEAKER_ID };
    guildSettings.set(guildId, settings);
  }
  settings.speakerId = speakerId;
  saveSettings();
}

const SUPPORTED_LANGUAGES = {
  auto: "Auto-detect (respond in the user's language)",
  en: "English",
  ja: "日本語 (Japanese)",
};

/**
 * Get the response language for a guild.
 * @param {string} guildId
 * @returns {string}
 */
function getLanguage(guildId) {
  const settings = guildSettings.get(guildId);
  return settings?.language ?? "auto";
}

/**
 * Set the response language for a guild.
 * @param {string} guildId
 * @param {string} langCode
 */
function setLanguage(guildId, langCode) {
  let settings = guildSettings.get(guildId);
  if (!settings) {
    settings = { speakerId: DEFAULT_SPEAKER_ID };
    guildSettings.set(guildId, settings);
  }
  settings.language = langCode;
  saveSettings();
}

// Load on module init
loadSettings();

module.exports = {
  getSpeakerId,
  setSpeakerId,
  getLanguage,
  setLanguage,
  SUPPORTED_LANGUAGES,
  DEFAULT_SPEAKER_ID,
};
