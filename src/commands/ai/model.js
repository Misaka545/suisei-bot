const { SlashCommandBuilder } = require("discord.js");
const { ensureChat } = require("../../utils/aiChatState");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("model").setDescription("Choose/view the Gemini model")
    .addSubcommand((sc) =>
      sc.setName("set").setDescription("Set model name")
        .addStringOption((opt) => opt.setName("name").setDescription("e.g. gemini-2.5-flash").setRequired(true)))
    .addSubcommand((sc) => sc.setName("view").setDescription("View current model")),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const s = ensureChat(interaction.channelId, process.env.GEMINI_MODEL || "gemini-2.5-flash");
    if (sub === "set") {
      const name = interaction.options.getString("name");
      s.model = name;
      return interaction.reply(`🧠 Gemini model set to \`${name}\`.`);
    }
    if (sub === "view") {
      return interaction.reply(`🧠 Current Gemini model: \`${s.model}\``);
    }
  },
};
