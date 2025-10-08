const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { EndBehaviorType, AudioPlayerStatus } = require("@discordjs/voice");
const { ensureVA } = require("../../utils/vaState");
const { ensureMusic, connectIfNeeded } = require("../../utils/musicState");
const { makeOpusDecoderMono48k, pcmToWav48kMono } = require("../../utils/audioProcessing");
const { geminiTranscribe, aiGenerate } = require("../../services/geminiService");
const { ttsResourceFromText } = require("../../services/ttsService");
const { EPHEMERAL_FLAG } = require("../../utils/discordHelpers");

module.exports = {
  data: new SlashCommandBuilder().setName("va").setDescription("Voice assistant controls")
    .addSubcommand((sc) => sc.setName("start").setDescription("Start voice assistant")),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "start") return;

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) return interaction.reply("❌ Join a voice channel first.");
    if (voiceChannel.type === ChannelType.GuildStageVoice && member.voice.suppress)
      return interaction.reply("🎙️ Bạn đang là **Audience** trong Stage. Hãy **Request to Speak** rồi chạy lại `/va start`.");

    await interaction.reply("🎙️ Voice Assistant: **ON**. (Listening)");
    const st = await connectIfNeeded(interaction, voiceChannel, { selfDeaf: false });

    const guildId = interaction.guild.id;
    const va = ensureVA(guildId);
    va.active = true;

    const receiver = st.connection.receiver;
    receiver.speaking.on("start", async (userId) => {
      if (!va.active || va.processing) return;
      const m = interaction.guild.members.cache.get(userId);
      if (!m || m.user.bot) return;

      va.processing = true;
      try {
        const opus = receiver.subscribe(userId, {
          end: { behavior: EndBehaviorType.AfterSilence, duration: 1200 },
          autoDestroy: true,
        });

        const decoder = makeOpusDecoderMono48k();
        const pcm = opus.pipe(decoder);

        let pcmBytes = 0, framesSeen = 0;
        const chunks = [];
        let warmupLeft = 3;
        pcm.on("data", (c) => {
          framesSeen++;
          if (warmupLeft > 0) { warmupLeft--; return; }
          pcmBytes += c.length;
          chunks.push(c);
        });

        const HARD_TIMEOUT_MS = 7000;
        const hard = setTimeout(() => {
          try { opus.destroy(); } catch {} try { pcm.destroy(); } catch {}
        }, HARD_TIMEOUT_MS);

        await new Promise((res) => {
          const done = () => res();
          pcm.on("end", done); pcm.on("close", done); pcm.on("error", done);
          opus.on("end", done); opus.on("close", done); opus.on("error", done);
        }).finally(() => clearTimeout(hard));

        const wav = chunks.length ? pcmToWav48kMono(Buffer.concat(chunks)) : Buffer.alloc(0);
        if (!pcmBytes || wav.length < 2000) {
          va.processing = false;
          await interaction.followUp({
            content: "⚠️ VA không nhận được âm thanh (thử nói gần mic hơn).",
            flags: EPHEMERAL_FLAG,
          }).catch(() => {});
          return;
        }

        // STT
        let transcript = "";
        try { transcript = await geminiTranscribe(wav); }
        catch (e) {
          va.processing = false;
          await interaction.followUp({ content: "❌ Lỗi nhận diện giọng nói (STT).", flags: EPHEMERAL_FLAG }).catch(() => {});
          return;
        }
        if (!transcript) { va.processing = false; return; }

        // Wakeword
        if (va.wakeword && !transcript.toLowerCase().includes(va.wakeword.toLowerCase())) {
          va.processing = false; return;
        }
        if (va.wakeword) {
          const re = new RegExp(va.wakeword, "i");
          transcript = transcript.replace(re, "").trim();
        }

        // LLM
        const { ensureChat, pushHistory } = require("../../utils/aiChatState");
        const session = ensureChat(interaction.channelId, process.env.GEMINI_MODEL || "gemini-1.5-flash");
        let replyText = "";
        try { replyText = await aiGenerate(session, transcript); }
        catch (e) {
          va.processing = false;
          await interaction.followUp({ content: "❌ Lỗi AI tạo câu trả lời.", flags: EPHEMERAL_FLAG }).catch(() => {});
          return;
        }
        pushHistory(session, "user", transcript);
        pushHistory(session, "assistant", replyText);

        // Pause nhạc khi bot nói
        const stNow = require("../../utils/musicState").music.get(guildId);
        const pausedForVA =
          stNow?.player && stNow.player.state.status === AudioPlayerStatus.Playing
            ? stNow.player.pause(true)
            : false;

        // TTS phát ra voice channel
        try {
          const ttsRes = await ttsResourceFromText(replyText, va.lang);
          st.player.play(ttsRes);
        } catch (e) {
          await interaction.followUp({ content: `🗨️ ${replyText}`, flags: EPHEMERAL_FLAG }).catch(() => {});
          if (pausedForVA) stNow?.player?.unpause();
          va.processing = false; return;
        }

        const onIdle = () => {
          st.player.off(AudioPlayerStatus.Idle, onIdle);
          if (pausedForVA) stNow?.player?.unpause();
          va.processing = false;
        };
        st.player.on(AudioPlayerStatus.Idle, onIdle);
      } catch (e) {
        console.error("[VA] pipeline error:", e);
        va.processing = false;
        await interaction.followUp({ content: "⚠️ VA pipeline error.", flags: EPHEMERAL_FLAG }).catch(() => {});
      }
    });
  },
};
