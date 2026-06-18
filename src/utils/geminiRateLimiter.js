// src/utils/geminiRateLimiter.js
const RATE_LIMIT = 14;           
const WINDOW_MS = 60_000;        
const timestamps = [];            

/**
 * Check whether we can make a Gemini API call right now.
 * @returns {boolean} true if under the rate limit
 */
function canCallGemini() {
  pruneOld();
  return timestamps.length < RATE_LIMIT;
}

function recordGeminiCall() {
  pruneOld();
  timestamps.push(Date.now());
}

function remainingCalls() {
  pruneOld();
  return Math.max(0, RATE_LIMIT - timestamps.length);
}

function pruneOld() {
  const cutoff = Date.now() - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

module.exports = { canCallGemini, recordGeminiCall, remainingCalls };
