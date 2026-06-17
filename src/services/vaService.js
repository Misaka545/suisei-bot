const { EndBehaviorType } = require("@discordjs/voice");
const { makeOpusDecoderMono48k, pcmToWav48kMono } = require("../utils/audioProcessing");
const { geminiTranscribe } = require("./geminiService");
const { ensureChat, aiGenerate } = require("../utils/aiChatState");
const { speakTextToChannel } = require("./ttsService");
const { ensureVA } = require("../utils/vaState");

const listeningMap = new Map(); // Map<guildId, Set<userId>>
const attachedConnections = new WeakSet();

function startListening(connection, voiceChannel) {
  const guildId = voiceChannel.guild.id;
  const va = ensureVA(guildId);
  va.active = true;

  if (!listeningMap.has(guildId)) {
    listeningMap.set(guildId, new Set());
  }
  const activeListeners = listeningMap.get(guildId);

  if (!attachedConnections.has(connection)) {
    attachedConnections.add(connection);

    connection.receiver.speaking.on("start", (userId) => {
    if (!va.active) return;
    
    if (activeListeners.has(userId)) return;
    
    if (va.processing) return;

    activeListeners.add(userId);

    const stream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1500,
      },
    });

    const opusDecoder = makeOpusDecoderMono48k();
    const pcmChunks = [];
    let durationBytes = 0;

    stream.pipe(opusDecoder);

    opusDecoder.on("data", (chunk) => {
      pcmChunks.push(chunk);
      durationBytes += chunk.length;
    });

    stream.on("end", async () => {
      activeListeners.delete(userId);
      if (!va.active) return;

      if (durationBytes < 48000) return;

      if (va.processing) return;
      va.processing = true;

      try {
        const pcmBuffer = Buffer.concat(pcmChunks);
        const wavBuffer = pcmToWav48kMono(pcmBuffer);

        console.log(`[VA - ${guildId}] Transcribing audio from ${userId}...`);
        const text = await geminiTranscribe(wavBuffer);
        
        if (!text || text.trim().length < 2) {
          va.processing = false;
          return;
        }

        console.log(`[VA - ${guildId}] User ${userId} said: "${text}"`);

        if (va.wakeword) {
          const lowerText = text.toLowerCase();
          const lowerWake = va.wakeword.toLowerCase();
          if (!lowerText.includes(lowerWake)) {
            va.processing = false;
            return;
          }
        }

        const session = ensureChat(voiceChannel.id);
        
        const aiPrompt = `(Voice Context - Respond naturally and concisely as if speaking out loud) ${text}`;
        
        const replyText = await aiGenerate(session, aiPrompt, guildId);
        await speakTextToChannel(voiceChannel, replyText, guildId);

      } catch (err) {
        console.error("[VA Error]", err.message || err);
      } finally {
        va.processing = false;
      }
    });
  });
  }
}

function stopListening(guildId) {
  const va = ensureVA(guildId);
  va.active = false;
  va.processing = false;
  listeningMap.delete(guildId);
}

module.exports = { startListening, stopListening };
