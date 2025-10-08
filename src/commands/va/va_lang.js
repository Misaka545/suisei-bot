const { SlashCommandBuilder } = require("discord.js");
const { ensureVA } = require("../../utils/vaState");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("va").setDescription("Voice assistant controls")
    .addSubcommand((sc) =>
      sc.setName("lang").setDescription("Set TTS language")
        .addStringOption((opt) =>
          opt.setName("code").setDescription("auto | en | vi | ja").setRequired(true)
            .addChoices(
              { name: "auto", value: "auto" },
              { name: "English", value: "en" },
              { name: "Tiếng Việt", value: "vi" },
              { name: "日本語", value: "ja" }
            ))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "lang") return;
    const code = interaction.options.getString("code");
    if (!["auto", "en", "vi", "ja"].includes(code))
      return interaction.reply("❌ Use one of: `auto`, `en`, `vi`, `ja`.");
    const va = ensureVA(interaction.guild.id);
    va.lang = code;
    return interaction.reply(`🌐 TTS language set to **${code}**`);
  },
};
