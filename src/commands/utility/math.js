const { SlashCommandBuilder } = require("discord.js");
const math = require("mathjs");

const DANGEROUS_PATTERNS = /(?:import|eval|function|while|for|process|global|require|constructor|__proto__|prototype|\[\s*\.\.\s*\]|!\s*!|\d{3,}!)/i;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("math")
    .setDescription("Calculate a math expression")
    .addStringOption((opt) =>
      opt.setName("expression").setDescription("The math expression (max 100 chars)").setRequired(true)
    ),
  async execute(interaction) {
    const expr = interaction.options.getString("expression")?.trim();
    if (!expr) {
      return interaction.reply({ content: "❌ Please provide an expression.", ephemeral: true });
    }

    if (expr.length > 100) {
      return interaction.reply({ content: "❌ Expression too long! Maximum 100 characters.", ephemeral: true });
    }

    if (DANGEROUS_PATTERNS.test(expr)) {
      return interaction.reply({ content: "❌ Expression contains unsupported or disallowed operators/keywords.", ephemeral: true });
    }

    try {
      const result = math.evaluate(expr);
      const strResult = String(result);
      if (strResult.length > 1500) {
        return interaction.reply({ content: "🧮 Result is too large to display.", ephemeral: true });
      }
      await interaction.reply(`🧮 Result: **${strResult}**`);
    } catch {
      await interaction.reply({ content: "❌ Invalid mathematical expression!", ephemeral: true });
    }
  },
};
