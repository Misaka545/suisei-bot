// src/commands/ai/language.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getLanguage,
  setLanguage,
  SUPPORTED_LANGUAGES,
} = require("../../utils/voiceSettings");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("language")
    .setDescription("Set Suisei's response language for this server")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Change the response language")
        .addStringOption((opt) =>
          opt
            .setName("lang")
            .setDescription("Language code")
            .setRequired(true)
            .setChoices(
              ...Object.entries(SUPPORTED_LANGUAGES).map(([value, name]) => ({
                name: `${name}`,
                value,
              }))
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("current")
        .setDescription("Show the current response language")
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all supported languages")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "set") {
      const langCode = interaction.options.getString("lang");
      const langName = SUPPORTED_LANGUAGES[langCode] || langCode;

      setLanguage(interaction.guildId, langCode);

      const description =
        langCode === "auto"
          ? "🌐 Language set to **Auto-detect** — Suisei will respond in the same language the user writes in."
          : `🌐 Language set to **${langName}** — Suisei will now respond in this language.`;

      await interaction.reply({
        content: description,
        ephemeral: false,
      });
    } else if (subcommand === "current") {
      const langCode = getLanguage(interaction.guildId);
      const langName = SUPPORTED_LANGUAGES[langCode] || langCode;

      await interaction.reply({
        content: `🌐 Current response language: **${langName}** (\`${langCode}\`)\nUse \`/language set\` to change.`,
        ephemeral: true,
      });
    } else if (subcommand === "list") {
      const lines = Object.entries(SUPPORTED_LANGUAGES).map(
        ([code, name]) => `\`${code.padEnd(5)}\` — ${name}`
      );

      const currentLang = getLanguage(interaction.guildId);

      const embed = new EmbedBuilder()
        .setAuthor({ name: "Supported Languages" })
        .setDescription(lines.join("\n"))
        .setColor("#3b82f6")
        .setFooter({
          text: `Current: ${SUPPORTED_LANGUAGES[currentLang] || currentLang} (${currentLang})`
        });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
