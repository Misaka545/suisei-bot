const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  createAudioPlayer,
  AudioPlayerStatus,
  createAudioResource,
  NoSubscriberBehavior,
} = require("@discordjs/voice");
const { ChannelType } = require("discord.js");

let player;

function getAudioPlayer() {
  if (!player) {
    player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });
    player.on("error", (err) =>
      console.error("[VoicePlayer Error]", err.message)
    );
  }
  return player;
}

async function ensureConnection(voiceChannel) {
  if (!voiceChannel)
    throw new Error("User not in voice channel, cannot speak.");

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

  // Stage channel → un-suppress
  if (voiceChannel.type === ChannelType.GuildStageVoice) {
    try {
      await voiceChannel.guild.members.me.voice.setSuppressed(false);
    } catch (e) {
      console.warn("Cannot un-suppress stage:", e.message);
    }
  }

  connection.subscribe(getAudioPlayer());
  return connection;
}

async function playTTSResource(voiceChannel, resource) {
  const connection = await ensureConnection(voiceChannel);
  const player = getAudioPlayer();

  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 5_000);
  console.log("[VA TTS] Playing audio...");
}

module.exports = { playTTSResource };
