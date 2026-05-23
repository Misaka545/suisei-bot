const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("math")
    .setDescription("Calculate a math expression")
    .addStringOption((opt) =>
      opt.setName("expression").setDescription("The math expression").setRequired(true)
    ),
  async execute(interaction) {
    const expr = interaction.options.getString("expression");
    try {
      const math = require("mathjs");
      const result = math.evaluate(expr);
      await interaction.reply(`🧮 Result: **${result}**`);
    } catch {
      await interaction.reply("❌ Invalid expression!");
    }
  },
};
