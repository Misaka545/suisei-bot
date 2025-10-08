// src/commands/va/va_start.js
const { ChannelType } = require("discord.js");
const { AudioPlayerStatus, EndBehaviorType } = require("@discordjs/voice");

// Helpers/States/Services bạn đã tách sẵn
const { ensureVA } = require("../../utils/vaState");
const { ensureChat, aiGenerate } = require("../../utils/aiChatState");
const { ensureMusic, connectIfNeeded } = require("../../utils/musicState");
const { geminiTranscribe } = require("../../services/geminiService");
const { ttsResourceFromText } = require("../../services/ttsService");

// Audio utils (ffmpegPath, prism, …). Có thể bạn gộp chúng trong 1 util.
const { ffmpegPath, prism } = require("../../utils/audioProcessing");

// Một số tuỳ chọn nhẹ cho pipeline
const EPHEMERAL_FLAG = 1 << 6;
const WARMUP_FRAMES = 3;      // bỏ vài frame đầu để tránh hư đầu gói
const HARD_TIMEOUT_MS = 7000; // cứng timeout thu âm 1 lượt nói

module.exports = async function handleVaStart(interaction) {
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    return interaction.reply({ content: "❌ Join a voice channel first.", flags: EPHEMERAL_FLAG });
  }

  // Stage channel guard: phải là Speaker (không phải Audience)
  if (voiceChannel.type === ChannelType.GuildStageVoice && member.voice.suppress) {
    return interaction.reply({
      content: "🎙️ Bạn đang là **Audience** trong Stage. Hãy **Request to Speak** rồi chạy lại `/va start`.",
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
  ensureMusic(guild.id); // đảm bảo có state nhạc (để tạm dừng/unpause khi bot nói)

  const receiver = st.connection.receiver;

  // Mỗi lần ai đó bắt đầu nói -> thu và xử lý
  receiver.speaking.on("start", async (userId) => {
    try {
      if (!va.active || va.processing) return;
      const m = guild.members.cache.get(userId);
      if (!m || m.user.bot) return;

      // Chỉ xử lý người đang gọi lệnh? (tuỳ chọn)
      // if (m.id !== interaction.user.id) return;

      va.processing = true;
      console.log(`[VA] speaking start from ${m.user.tag} (${userId})`);

      // 1) Opus stream từ Discord -> decode PCM 48k mono
      const opus = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 1200 },
        autoDestroy: true,
      });

      opus.on("error", (e) => console.warn("[VA] opus stream error:", e?.message || e));

      const decoder = new prism.opus.Decoder({
        frameSize: 960, // 20ms @ 48k
        channels: 1,
        rate: 48000,
      });

      decoder.on("error", (e) => {
        // frame hỏng — bỏ qua
        console.warn("[VA] opus decoder error:", e?.message || e);
      });

      const pcm = opus.pipe(decoder);

      // Bỏ 1 vài khung đầu (warm-up)
      const { Transform } = require("stream");
      let warmupLeft = WARMUP_FRAMES;
      const warmupStripper = new Transform({
        transform(chunk, _enc, cb) {
          if (warmupLeft > 0) { warmupLeft--; return cb(); }
          cb(null, chunk);
        },
      });

      // 2) PCM 48k mono -> WAV 16k mono bằng ffmpeg
      const ff = new prism.FFmpeg({
        command: ffmpegPath,
        args: [
          "-f","s16le","-ar","48000","-ac","1","-i","pipe:0",
          "-ar","16000","-ac","1","-f","wav","pipe:1","-loglevel","quiet",
        ],
      });

      ff.on("error", (e) => console.warn("[VA] ffmpeg transcode error:", e?.message || e));

      let pcmBytes = 0, framesSeen = 0;
      pcm.on("data", (c) => { pcmBytes += c.length; framesSeen++; });

      const wavStream = pcm.pipe(warmupStripper).pipe(ff);

      // HARD TIMEOUT để không treo
      const hardTimeout = setTimeout(() => {
        console.warn("[VA] hard timeout reached; forcing stream end");
        try { opus.destroy(); } catch {}
        try { pcm.destroy(); } catch {}
        try { warmupStripper.destroy(); } catch {}
        try { ff.destroy(); } catch {}
      }, HARD_TIMEOUT_MS);

      // Thu WAV buffer
      const wav = await new Promise((resolve, reject) => {
        const chunks = [];
        wavStream.on("data", (c) => chunks.push(c));
        wavStream.on("error", reject);
        wavStream.on("end", () => resolve(Buffer.concat(chunks)));
      }).finally(() => clearTimeout(hardTimeout));

      const wavBytes = wav?.length || 0;
      console.log(`[VA] frames=${framesSeen} | PCM bytes=${pcmBytes} | WAV bytes=${wavBytes}`);

      if (!pcmBytes || wavBytes < 2000) {
        va.processing = false;
        await interaction.followUp({
          content: "⚠️ VA không nhận được âm thanh. Kiểm tra quyền mic / nói gần hơn / tắt server deafen.",
          flags: EPHEMERAL_FLAG,
        }).catch(() => {});
        return;
      }

      // 3) STT (Gemini)
      let transcript = "";
      try {
        transcript = await geminiTranscribe(wav);
        console.log(`[VA] transcript="${(transcript || "").slice(0, 120)}${(transcript || "").length > 120 ? "..." : ""}"`);
      } catch (e) {
        console.error("[VA] STT error:", e);
        va.processing = false;
        await interaction.followUp({ content: "❌ Lỗi nhận diện giọng nói (STT).", flags: EPHEMERAL_FLAG }).catch(() => {});
        return;
      }

      if (!transcript) {
        va.processing = false;
        return;
      }

      // 4) Wakeword (nếu có)
      if (va.wakeword && !transcript.toLowerCase().includes(va.wakeword.toLowerCase())) {
        console.log("[VA] wakeword not found, ignore");
        va.processing = false;
        return;
      }
      if (va.wakeword) {
        const re = new RegExp(va.wakeword, "i");
        transcript = transcript.replace(re, "").trim();
      }

      // 5) LLM (Gemini) — hội thoại theo kênh
      const session = ensureChat(interaction.channelId);
      let replyText = "";
      try {
        replyText = await aiGenerate(session, transcript);
        console.log(`[VA] reply="${replyText.slice(0, 120)}${replyText.length > 120 ? "..." : ""}"`);
      } catch (e) {
        console.error("[VA] LLM error:", e);
        va.processing = false;
        await interaction.followUp({ content: "❌ Lỗi AI tạo câu trả lời.", flags: EPHEMERAL_FLAG }).catch(() => {});
        return;
      }

      // 6) TTS & phát — tạm dừng nhạc nếu đang phát
      const stNow = ensureMusic(guild.id);
      const pausedForVA =
        stNow?.player && stNow.player.state.status === AudioPlayerStatus.Playing
          ? stNow.player.pause(true)
          : false;

      try {
        const ttsRes = await ttsResourceFromText(replyText, va.lang);
        st.player.play(ttsRes);
      } catch (e) {
        console.error("[VA] TTS error:", e);
        await interaction.followUp({ content: `🗨️ ${replyText}`, flags: EPHEMERAL_FLAG }).catch(() => {});
        if (pausedForVA) stNow?.player?.unpause();
        va.processing = false;
        return;
      }

      // Khi TTS xong -> unpause nhạc + sẵn sàng lượt nói mới
      const onIdle = () => {
        st.player.off(AudioPlayerStatus.Idle, onIdle);
        if (pausedForVA) stNow?.player?.unpause();
        va.processing = false;
        console.log("[VA] TTS finished");
      };
      st.player.on(AudioPlayerStatus.Idle, onIdle);
    } catch (e) {
      console.error("[VA] pipeline error:", e);
      va.processing = false;
      await interaction.followUp({ content: "⚠️ VA pipeline error.", flags: EPHEMERAL_FLAG }).catch(() => {});
    }
  });
};
