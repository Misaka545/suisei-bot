// src/utils/textToKatakana.js
// Converts English/Latin text to Japanese Katakana for VOICEVOX speech synthesis

const { GoogleGenerativeAI } = require("@google/generative-ai");

const katakanaCache = new Map();
const MAX_CACHE_SIZE = 500;

let genAI = null;
function getGenAI() {
  if (!genAI && process.env.GOOGLE_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return genAI;
}

/**
 * Check if text contains Japanese Kana characters
 * @param {string} text
 * @returns {boolean}
 */
function containsJapanese(text) {
  if (!text) return false;
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

/**
 * Check if text is predominantly Latin/English
 * @param {string} text
 * @returns {boolean}
 */
function isPredominantlyLatin(text) {
  if (!text) return false;
  if (containsJapanese(text)) return false;
  return /[a-zA-Z]/.test(text);
}

// Basic phonetic dictionary for fallback if Gemini is offline
const BASIC_WORD_MAP = {
  hello: "ハロー",
  hi: "ハイ",
  hey: "ヘイ",
  bye: "バイバイ",
  goodbye: "グッドバイ",
  thanks: "サンクス",
  thank: "サンク",
  you: "ユー",
  yes: "イエス",
  no: "ノー",
  ok: "オーケー",
  okay: "オーケー",
  good: "グッド",
  morning: "モーニング",
  night: "ナイト",
  suisei: "スイセイ",
  hoshimachi: "ホシマチ",
  help: "ヘルプ",
  bot: "ボット",
  discord: "ディスコード",
  please: "プリーズ",
  sorry: "ソーリー",
  what: "ワット",
  how: "ハウ",
  why: "ワイ",
  where: "ウェア",
  who: "フー",
  welcome: "ウェルカム",
};

/**
 * Fallback converter using basic word matching & letter rules
 * @param {string} text
 * @returns {string}
 */
function fallbackToKatakana(text) {
  return text
    .split(/\b/)
    .map((token) => {
      const lower = token.toLowerCase();
      if (BASIC_WORD_MAP[lower]) return BASIC_WORD_MAP[lower];
      return token;
    })
    .join("");
}

/**
 * Convert English / Latin text to Japanese Katakana using Gemini with cache and fallback.
 * @param {string} text
 * @returns {Promise<string>}
 */
async function toKatakanaForVoicevox(text) {
  if (!text || typeof text !== "string") return "";

  if (!isPredominantlyLatin(text)) {
    return text;
  }

  const trimmed = text.trim();
  if (katakanaCache.has(trimmed)) {
    return katakanaCache.get(trimmed);
  }

  const ai = getGenAI();
  if (!ai) {
    return fallbackToKatakana(trimmed);
  }

  try {
    const model = ai.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    });

    const prompt = `Convert the following English text to Japanese Katakana pronunciation for anime character voice text-to-speech.
Return ONLY the Katakana text with appropriate spacing and punctuation. Do NOT include quotes, romanization, or explanation.

Example:
Input: Hello! How are you doing today?
Output: ハロー！ハウアーユー ドゥーイング トゥデイ？

Input: ${trimmed}`;

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Katakana conversion timeout")), 4000)
      ),
    ]);

    const katakana = result?.response?.text()?.trim();
    if (katakana && containsJapanese(katakana)) {
      if (katakanaCache.size >= MAX_CACHE_SIZE) {
        const firstKey = katakanaCache.keys().next().value;
        katakanaCache.delete(firstKey);
      }
      katakanaCache.set(trimmed, katakana);
      console.log(`[TTS Katakana] "${trimmed.slice(0, 40)}..." -> "${katakana.slice(0, 40)}..."`);
      return katakana;
    }
  } catch (err) {
    console.warn(`[TTS Katakana] Conversion failed (${err.message}), using fallback.`);
  }

  return fallbackToKatakana(trimmed);
}

module.exports = {
  toKatakanaForVoicevox,
  isPredominantlyLatin,
  containsJapanese,
};
