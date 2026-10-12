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

  const isDead =
    !st.connection ||
    [VoiceConnectionStatus.Destroyed, VoiceConnectionStatus.Disconnected].includes(
      st.connection.state?.status
    );

  const channelChanged = st.connection && st.connection.joinConfig.channelId !== voiceChannel.id;
  const wrongDeaf = st.connection && st.connection.joinConfig.selfDeaf !== selfDeaf;

  if (isDead) {
    try { st.connection?.destroy?.(); } catch {}
    const newConn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf,
    });
    st.connection = newConn;

    if (!st.player) {
      st.player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
      });
    }
    st.connection.subscribe(st.player);

    newConn.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(newConn, VoiceConnectionStatus.Connecting, 5_000),
          entersState(newConn, VoiceConnectionStatus.Ready, 5_000),
        ]);
      } catch {
        try { newConn.destroy(); } catch {}
        if (st.connection === newConn) {
          st.connection = null;
        }
      }
    });

    newConn.on(VoiceConnectionStatus.Destroyed, () => {
      if (st.connection === newConn) {
        st.connection = null;
        st.player = null;
        st.queue = [];
        st.currentProc = null;
        st.currentTrack = null;
        st.skipping = false;
      }
    });

    newConn.on("error", (err) => {
      console.warn("[VoiceConnection] Unhandled connection error:", err.message);
    });
  } else if (channelChanged || wrongDeaf) {
    joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf,
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
