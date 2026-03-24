const { SlashCommandBuilder } = require("discord.js");
const { ensureChat, defaultPersona } = require("../../utils/aiChatState");
const { sendLongReply } = require("../../utils/discordHelpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("persona").setDescription("Manage the persona")
    .addSubcommand((sc) =>
      sc.setName("set").setDescription("Set persona prompt")
        .addStringOption((opt) => opt.setName("prompt").setDescription("Persona/system prompt").setRequired(true)))
    .addSubcommand((sc) => sc.setName("view").setDescription("View current persona"))
    .addSubcommand((sc) => sc.setName("reset").setDescription("Reset persona to default")),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const s = ensureChat(interaction.channelId, process.env.GEMINI_MODEL || "gemini-2.5-flash");
    if (sub === "set") {
      const prompt = interaction.options.getString("prompt");
      s.persona = prompt;
      return interaction.reply("✨ Persona updated for this channel.");
    }
    if (sub === "view") {
      return sendLongReply(interaction, `**Current persona:**\n${s.persona}`);
    }
    if (sub === "reset") {
      s.persona = defaultPersona();
      return interaction.reply("↩️ Persona reset to default.");
    }
  },
};
