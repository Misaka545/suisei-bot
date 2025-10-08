const { SlashCommandBuilder } = require("discord.js");
const { ensureVA } = require("../../utils/vaState");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("va").setDescription("Voice assistant controls")
    .addSubcommand((sc) =>
      sc.setName("wakeword").setDescription("Set a wakeword or 'off'")
        .addStringOption((opt) => opt.setName("word").setDescription("e.g. suisei or 'off'").setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "wakeword") return;
    const va = ensureVA(interaction.guild.id);
    const word = interaction.options.getString("word");
    if (word === "off") { va.wakeword = null; return interaction.reply("🔔 Wakeword disabled."); }
    if (!word || word.length < 2) return interaction.reply("❌ Please provide a wakeword (≥2 chars) or `off`.");
    va.wakeword = word; return interaction.reply(`🔔 Wakeword set to **${word}**`);
  },
};
