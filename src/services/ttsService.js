// src/services/ttsService.js

const {
  entersState,
  createAudioPlayer,
  NoSubscriberBehavior,
  AudioPlayerStatus,
} = require("@discordjs/voice");
const { ChannelType } = require("discord.js");
const { synthesize: voicevoxSynthesize, isAvailable: isVoicevoxAvailable } = require("./voicevoxService");
const { toKatakanaForVoicevox, isPredominantlyLatin } = require("../utils/textToKatakana");
const { getSpeakerId, getLanguage } = require("../utils/voiceSettings");
const { connectIfNeeded, music } = require("../utils/musicState");

const guildTtsPlayers = new Map();

function getPlayerForGuild(guildId) {
  let player = guildTtsPlayers.get(guildId);
  if (!player) {
    player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });
    player.on("error", (err) =>
      console.error(`[AudioPlayer error - ${guildId}]`, err?.message || err)
    );
    guildTtsPlayers.set(guildId, player);
  }
  return player;
}

/**
 * Generate a Discord AudioResource from text.
 * @param {string} text - Text to speak
 * @param {string} [guildId] - Guild ID for per-guild speaker and language settings
 * @returns {Promise<import("@discordjs/voice").AudioResource>}
 */
async function ttsResourceFromText(text, guildId) {
  const speakerId = guildId ? getSpeakerId(guildId) : getSpeakerId("default");

  const voicevoxReady = await isVoicevoxAvailable();
  if (!voicevoxReady) {
    throw new Error("VOICEVOX engine is offline (http://127.0.0.1:50021). Please ensure VOICEVOX container is running.");
  }

  let textToSynthesize = text;

  // If text is English / Latin, transcribe into Katakana so VOICEVOX pronounces it in character
  if (isPredominantlyLatin(text)) {
    textToSynthesize = await toKatakanaForVoicevox(text);
  }

  return voicevoxSynthesize(textToSynthesize, speakerId);
}

/**
 * Play an AudioResource in a voice channel, pausing music if necessary.
 * @param {import("discord.js").VoiceBasedChannel} voiceChannel
 * @param {import("@discordjs/voice").AudioResource} resource
 */
async function speakResourceToChannel(voiceChannel, resource) {
  const guildId = voiceChannel.guild.id;
  
  const st = await connectIfNeeded({ guild: { id: guildId, voiceAdapterCreator: voiceChannel.guild.voiceAdapterCreator } }, voiceChannel, { selfDeaf: false });
  const connection = st.connection;
  if (!connection) throw new Error("Could not establish voice connection.");

  const me = voiceChannel.guild.members.me;
  try {
    if (me?.voice?.deaf) await me.voice.setDeaf(false);
    if (me?.voice?.mute) await me.voice.setMute(false);
    if (voiceChannel.type === ChannelType.GuildStageVoice && me?.voice?.suppress) {
      await me.voice.setSuppressed(false);
    }
  } catch (e) {
    console.warn("[TTS] Could not undeafen/unmute:", e.message);
  }

  const musicState = music.get(guildId);
  const musicPlayer = musicState?.player;
  const wasPlayingMusic = musicPlayer && musicPlayer.state.status === AudioPlayerStatus.Playing;

  if (wasPlayingMusic) {
    musicPlayer.pause();
  }

  const ttsPlayer = getPlayerForGuild(guildId);
  connection.subscribe(ttsPlayer);
  ttsPlayer.play(resource);

  // Wait for TTS to finish (up to 30s)
  await entersState(ttsPlayer, AudioPlayerStatus.Idle, 30_000).catch(err => {
    console.warn("[TTS] Player idle timeout or error:", err.message);
  });

  // Resume music if it was playing
  if (wasPlayingMusic && st.connection && musicPlayer) {
    connection.subscribe(musicPlayer);
    musicPlayer.unpause();
  }
}

/**
 * Generate TTS from text and play it in a voice channel.
 * @param {import("discord.js").VoiceBasedChannel} voiceChannel
 * @param {string} text
 * @param {string} [guildId] - Guild ID for per-guild speaker settings
 */
async function speakTextToChannel(voiceChannel, text, guildId) {
  const resource = await ttsResourceFromText(text, guildId || voiceChannel.guild.id);
  await speakResourceToChannel(voiceChannel, resource);
}

module.exports = { ttsResourceFromText, speakTextToChannel, speakResourceToChannel };