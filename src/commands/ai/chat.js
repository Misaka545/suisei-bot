const { SlashCommandBuilder } = require("discord.js");
const { ephemeralOpt, editOrFollowLong } = require("../../utils/discordHelpers");
const { ensureChat, pushHistory } = require("../../utils/aiChatState");
const { aiGenerate } = require("../../services/geminiService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Chat with the Suisei persona")
    .addStringOption((opt) => opt.setName("message").setDescription("Your message").setRequired(true))
    .addBooleanOption((opt) => opt.setName("private").setDescription("Reply privately")),
  async execute(interaction) {
    const message = interaction.options.getString("message");
    const isPrivate = interaction.options.getBoolean("private") ?? false;
    await interaction.deferReply({ ...ephemeralOpt(isPrivate) });

    const session = ensureChat(interaction.channelId, process.env.GEMINI_MODEL || "gemini-1.5-flash");
    const reply = await aiGenerate(session, message);
    pushHistory(session, "user", message);
    pushHistory(session, "assistant", reply);
    await editOrFollowLong(interaction, reply, { ephemeral: isPrivate });
  },
};
