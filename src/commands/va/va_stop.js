const { SlashCommandBuilder } = require("discord.js");
const { ensureVA } = require("../../utils/vaState");

module.exports = {
  data: new SlashCommandBuilder().setName("va").setDescription("Voice assistant controls")
    .addSubcommand((sc) => sc.setName("stop").setDescription("Stop voice assistant")),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "stop") return;
    const va = ensureVA(interaction.guild.id);
    va.active = false;
    return interaction.reply("🛑 Voice Assistant: **OFF**.");
  },
};
