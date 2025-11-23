// src/commands/ai/chat.js

const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { ephemeralOpt, editOrFollowLong } = require("../../utils/discordHelpers");
// ONLY import ensureChat and aiGenerate from aiChatState
const { ensureChat, aiGenerate } = require("../../utils/aiChatState"); // Corrected import
// No need to import pushHistory, it's internal to aiChatState and handled by aiGenerate

const { speakTextToChannel } = require("../../services/ttsService");
const { connectIfNeeded } = require("../../utils/musicState");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Chat with the Suisei persona")
    .addStringOption((opt) => opt.setName("message").setDescription("Your message").setRequired(true))
    .addBooleanOption((opt) => opt.setName("private").setDescription("Reply privately"))
    .addBooleanOption((opt) =>
      opt.setName("voice")
        .setDescription("Speak the response in your voice channel")
        .setRequired(false)
    ),
  async execute(interaction) {
    const message = interaction.options.getString("message");
    const isPrivate = interaction.options.getBoolean("private") ?? false;
    const speakInVoice = interaction.options.getBoolean("voice") ?? false;

    await interaction.deferReply({ ...ephemeralOpt(isPrivate) });

    const session = ensureChat(interaction.channelId, process.env.GEMINI_MODEL || "gemini-2.5-flash");
    let reply = "";

    try {
      reply = await aiGenerate(session, message);
    } catch (llmError) {
      console.error("[Chat] LLM error:", llmError);
      await editOrFollowLong(interaction, "❌ Lỗi AI tạo câu trả lời.", { ephemeral: true });
      return;
    }

    // Send text reply
    await editOrFollowLong(interaction, reply, { ephemeral: isPrivate });

    // Handle voice output if requested
    if (speakInVoice) {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const voiceChannel = member?.voice?.channel;

      if (!voiceChannel) {
        await interaction.followUp({
          content: "❌ Để tôi nói, bạn cần ở trong một kênh thoại!",
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      if (voiceChannel.type === ChannelType.GuildStageVoice && member.voice.suppress) {
        await interaction.followUp({
          content: "🎙️ Bạn đang là **Audience** trong Stage. Để tôi nói, hãy **Request to Speak** trước.",
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      try {
        const st = await connectIfNeeded(interaction, voiceChannel, { selfDeaf: false, selfMute: false });

        const me = voiceChannel.guild.members.me;
        try {
          if (me?.voice?.selfDeaf) await me.voice.setSelfDeaf(false);
          if (me?.voice?.selfMute) await me.voice.setSelfMute(false);
          if (me?.voice?.serverDeaf) await me.voice.setDeaf(false);
          if (me?.voice?.serverMute) await me.voice.setMute(false);
          if (voiceChannel.type === ChannelType.GuildStageVoice && me.voice.suppress) {
            await me.voice.setSuppressed(false);
          }
        } catch (e) {
          console.warn("[ChatVA] cannot clear deaf/mute/suppress:", e?.message || e);
        }

        await speakTextToChannel(voiceChannel, reply, session.lang || "auto");
      } catch (ttsError) {
        console.error("[Chat] TTS error:", ttsError);
        await interaction.followUp({
          content: `❌ Lỗi khi phát giọng nói: ${ttsError.message}`,
          ephemeral: true,
        }).catch(() => {});
      }
    }
  },
};