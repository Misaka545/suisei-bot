const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { autoUpdateYtdlp } = require("../../utils/youtubeHelpers");
const { ephemeralOpt } = require("../../utils/discordHelpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("update-ytdlp")
    .setDescription("Check and update yt-dlp to the latest version")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ...ephemeralOpt(true) });
    try {
      const res = await autoUpdateYtdlp();
      const embed = new EmbedBuilder()
        .setColor(res.updated ? 0x00ff88 : 0xffaa00)
        .setTitle("☄️ yt-dlp Auto Updater")
        .setDescription(
          `**Status:** ${res.updated ? "✅ Complete" : "⚠️ Notification"}\n` +
          `\`\`\`\n${res.message || res.output || "yt-dlp is up to date"}\n\`\`\``
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({
        content: `❌ Error updating yt-dlp: ${err.message}`,
      });
    }
  },
};
