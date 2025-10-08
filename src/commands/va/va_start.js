// src/commands/va/va_start.js
const { ChannelType } = require("discord.js");
const {
  AudioPlayerStatus,
  EndBehaviorType,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const prism = require("prism-media");
const { Transform } = require("stream");

// States / Services (dùng đường dẫn tương đối)
const { ensureVA } = require("../../utils/vaState");
const { ensureChat, aiGenerate } = require("../../utils/aiChatState");
const { ensureMusic, connectIfNeeded } = require("../../utils/musicState");
const { geminiTranscribe } = require("../../services/geminiService");
const { ttsResourceFromText } = require("../../services/ttsService");
const pcmToWav48kMono = require("../../utils/pcmToWav");

// Config nhỏ cho VA
const EPHEMERAL_FLAG = 1 << 6;
const WARMUP_FRAMES = 3;       // bỏ vài khung đầu để tránh hư dữ liệu
const HARD_TIMEOUT_MS = 7000;  // cứng timeout cho 1 lượt nói

module.exports = async function handleVaStart(interaction) {
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    return interaction.reply({
      content: "❌ Join a voice channel first.",
      flags: EPHEMERAL_FLAG,
    });
  }

  // Stage channel: phải là Speaker, không phải Audience
  if (voiceChannel.type === ChannelType.GuildStageVoice && member.voice.suppress) {
    return interaction.reply({
      content:
        "🎙️ Bạn đang là **Audience** trong Stage. Hãy **Request to Speak** rồi chạy lại `/va start`.",
      flags: EPHEMERAL_FLAG,
    });
  }

  // Bật VA
  const va = ensureVA(guild.id);
  va.active = true;
  va.processing = false;

  await interaction.reply("🎙️ Voice Assistant: **ON**. (Listening)");

  // Kết nối voice — quan trọng: selfDeaf=false để nhận mic
  const st = await connectIfNeeded(interaction, voiceChannel, { selfDeaf: false });
  ensureMusic(guild.id); // đảm bảo state nhạc để pause/unpause khi bot nói

  const receiver = st.connection.receiver;

  // Khi có user bắt đầu nói → thu và xử lý
  receiver.speaking.on("start", async (userId) => {
    try {
      if (!va.active || va.processing) return;
      const m = guild.members.cache.get(userId);
      if (!m || m.user.bot) return;

      // Nếu muốn chỉ nghe người gọi lệnh, mở dòng sau:
      // if (m.id !== interaction.user.id) return;

      va.processing = true;
      console.log(`[VA] speaking start from ${m.user.tag} (${userId})`);

      // 1) Lấy stream Opus từ Discord → decode về PCM s16le 48k mono
      const opus = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 1200 },
        autoDestroy: true,
      });

      opus.on("error", (e) =>
        console.warn("[VA] opus stream error (recoverable):", e?.message || e)
      );

      const decoder = new prism.opus.Decoder({
        frameSize: 960, // 20ms @ 48k
        channels: 1,
        rate: 48000,
      });

      decoder.on("error", (e) => {
        // frame lỗi → bỏ qua
        console.warn(
          "[VA] opus decoder error (corrupted frame skipped):",
          e?.message || e
        );
      });

      const pcm = opus.pipe(decoder);

      // Bỏ vài frame đầu (warm-up)
      let warmupLeft = WARMUP_FRAMES;
      const warmupStripper = new Transform({
        transform(chunk, _enc, cb) {
          if (warmupLeft > 0) {
            warmupLeft--;
            return cb();
          }
          cb(null, chunk);
        },
      });

      // Thu PCM sau warm-up để đóng gói WAV (không dùng ffmpeg)
      const pcmAfterWarmStream = pcm.pipe(warmupStripper);

      let framesSeen = 0;
      let pcmBytes = 0;
      let pcmAfterWarmBytes = 0;
      const pcmChunks = [];

      pcm.on("data", (c) => {
        framesSeen++;
        pcmBytes += c.length;
      });
      pcmAfterWarmStream.on("data", (c) => {
        pcmAfterWarmBytes += c.length;
        pcmChunks.push(c);
      });

      // HARD TIMEOUT phòng kẹt
      const hardTimeout = setTimeout(() => {
        try { opus.destroy(); } catch {}
        try { pcm.destroy(); } catch {}
        try { pcmAfterWarmStream.destroy(); } catch {}
      }, HARD_TIMEOUT_MS);

      // Đợi kết thúc nói (sau 1.2s im lặng)
      await new Promise((resolve) => {
        const done = () => resolve();
        pcmAfterWarmStream.on("end", done);
        pcmAfterWarmStream.on("close", done);
        pcmAfterWarmStream.on("error", done);
        opus.on("end", done);
        opus.on("close", done);
        opus.on("error", done);
      }).finally(() => clearTimeout(hardTimeout));

      // Gói WAV trực tiếp từ PCM s16le 48k mono
      const pcmBuffer = Buffer.concat(pcmChunks);
      const wav = pcmBuffer.length ? pcmToWav48kMono(pcmBuffer) : Buffer.alloc(0);
      const wavBytes = wav.length;

      console.log(
        `[VA] frames=${framesSeen} | PCM bytes=${pcmBytes} | PCM(after warmup)=${pcmAfterWarmBytes} | WAV bytes=${wavBytes}`
      );

      if (!pcmAfterWarmBytes || wavBytes < 2000) {
        va.processing = false;
        await interaction
          .followUp({
            content:
              "⚠️ VA không nhận được âm thanh. (PCM OK nhưng WAV rỗng – đã bỏ ffmpeg) Hãy thử nói gần mic hơn hoặc kiểm tra thiết bị ghi âm.",
            flags: EPHEMERAL_FLAG,
          })
          .catch(() => {});
        return;
      }

      // 2) STT (Gemini)
      let transcript = "";
      try {
        transcript = await geminiTranscribe(wav);
        console.log(
          `[VA] transcript="${(transcript || "").slice(0, 120)}${
            (transcript || "").length > 120 ? "..." : ""
          }"`
        );
      } catch (e) {
        console.error("[VA] STT error:", e);
        va.processing = false;
        await interaction
          .followUp({
            content: "❌ Lỗi nhận diện giọng nói (STT).",
            flags: EPHEMERAL_FLAG,
          })
          .catch(() => {});
        return;
      }

      if (!transcript) {
        va.processing = false;
        return;
      }

      // 3) Wakeword (nếu có)
      if (
        va.wakeword &&
        !transcript.toLowerCase().includes(va.wakeword.toLowerCase())
      ) {
        console.log("[VA] wakeword not found, ignore");
        va.processing = false;
        return;
      }
      if (va.wakeword) {
        const re = new RegExp(va.wakeword, "i");
        transcript = transcript.replace(re, "").trim();
      }

      // 4) LLM (Gemini) — hội thoại theo kênh
      const session = ensureChat(interaction.channelId);
      let replyText = "";
      try {
        replyText = await aiGenerate(session, transcript);
        console.log(
          `[VA] reply="${replyText.slice(0, 120)}${
            replyText.length > 120 ? "..." : ""
          }"`
        );
      } catch (e) {
        console.error("[VA] LLM error:", e);
        va.processing = false;
        await interaction
          .followUp({
            content: "❌ Lỗi AI tạo câu trả lời.",
            flags: EPHEMERAL_FLAG,
          })
          .catch(() => {});
        return;
      }

      // 5) TTS & phát — tạm dừng nhạc nếu đang phát
      const stNow = ensureMusic(guild.id);
      const pausedForVA =
        stNow?.player &&
        stNow.player.state.status === AudioPlayerStatus.Playing
          ? stNow.player.pause(true)
          : false;

      // Không phát nếu connection không Ready
      const isConnReady =
        st.connection &&
        st.connection.state &&
        st.connection.state.status === VoiceConnectionStatus.Ready;

      if (!isConnReady || !st.player) {
        console.warn("[VA TTS] Connection not Ready or player missing; skip play.");
        await interaction
          .followUp({
            content: `🗨️ ${replyText}`,
            flags: EPHEMERAL_FLAG,
          })
          .catch(() => {});
        if (pausedForVA) stNow?.player?.unpause();
        va.processing = false;
        return;
      }

      // Gắn handler lỗi tạm thời cho player (tránh crash EPIPE)
      const onPlayerError = (err) => {
        console.warn("[VA TTS] AudioPlayer error:", err?.message || err);
      };
      st.player.on("error", onPlayerError);

      try {
        const ttsRes = await ttsResourceFromText(replyText, va.lang || "auto");
        st.player.play(ttsRes);
      } catch (e) {
        console.error("[VA] TTS error:", e);
        await interaction
          .followUp({ content: `🗨️ ${replyText}`, flags: EPHEMERAL_FLAG })
          .catch(() => {});
        if (pausedForVA) stNow?.player?.unpause();
        st.player.off("error", onPlayerError);
        va.processing = false;
        return;
      }

      const onIdle = () => {
        st.player.off(AudioPlayerStatus.Idle, onIdle);
        st.player.off("error", onPlayerError);
        if (pausedForVA) stNow?.player?.unpause();
        va.processing = false;
        console.log("[VA] TTS finished");
      };
      st.player.on(AudioPlayerStatus.Idle, onIdle);
    } catch (e) {
      console.error("[VA] pipeline error:", e);
      va.processing = false;
      await interaction
        .followUp({ content: "⚠️ VA pipeline error.", flags: EPHEMERAL_FLAG })
        .catch(() => {});
    }
  });
};
