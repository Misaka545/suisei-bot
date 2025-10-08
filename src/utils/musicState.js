const {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
} = require("@discordjs/voice");

const music = new Map();
/** st = { connection, player, queue: [{input,title}], currentProc, currentTrack, loopMode, skipping } */

function ensureMusic(guildId) {
  let st = music.get(guildId);
  if (!st) {
    st = {
      connection: null,
      player: null,
      queue: [],
      currentProc: null,
      currentTrack: null,
      loopMode: "off",
      skipping: false,
    };
    music.set(guildId, st);
  }
  return st;
}

async function connectIfNeeded(interaction, voiceChannel, { selfDeaf = true } = {}) {
  const guildId = interaction.guild.id;
  const st = ensureMusic(guildId);

  const needNew =
    !st.connection ||
    [VoiceConnectionStatus.Destroyed, VoiceConnectionStatus.Disconnected].includes(
      st.connection.state?.status
    );
  const wrongDeaf = st.connection && st.connection.joinConfig.selfDeaf !== selfDeaf;

  if (needNew || wrongDeaf) {
    try { st.connection?.destroy?.(); } catch {}
    st.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf,
    });
    st.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    st.connection.subscribe(st.player);

    st.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(st.connection, VoiceConnectionStatus.Connecting, 5_000),
          entersState(st.connection, VoiceConnectionStatus.Ready, 5_000),
        ]);
      } catch {
        try { st.connection.destroy(); } catch {}
        st.connection = null;
        st.player = null;
      }
    });

    st.connection.on(VoiceConnectionStatus.Destroyed, () => {
      st.connection = null;
      st.player = null;
      st.queue = [];
      st.currentProc = null;
      st.currentTrack = null;
      st.skipping = false;
    });
  }

  return st;
}

function enqueue(guildId, items) {
  const st = ensureMusic(guildId);
  for (const it of items) st.queue.push(it);
}

function disconnectGuild(guildId) {
  const st = music.get(guildId);
  if (!st) return;
  try { st.currentProc?.kill?.(); } catch {}
  try { st.connection?.destroy?.(); } catch {}
  st.connection = null;
  st.player = null;
  st.currentProc = null;
  st.currentTrack = null;
  st.queue = [];
  st.skipping = false;
}

module.exports = {
  music,
  ensureMusic,
  connectIfNeeded,
  enqueue,
  disconnectGuild,
  AudioPlayerStatus,
};
