const { SlashCommandBuilder } = require("discord.js");
const { music } = require("../../utils/musicState");
const { sendLongReply } = require("../../utils/discordHelpers");

module.exports = {
  data: new SlashCommandBuilder().setName("queue").setDescription("Show the playback queue"),
  async execute(interaction) {
    const st = music.get(interaction.guild.id);
    if (!st || (!st.player && (!st.queue || st.queue.length === 0)))
      return interaction.reply("📭 Queue is empty.");
    const lines = [];
    lines.push(`**Loop:** \`${st.loopMode}\``);
    if (st.player?.state?.resource?.metadata)
      lines.push(`**Now:** ${st.player.state.resource.metadata.title || "Unknown"}`);
    else lines.push("**Now:** (idle)");
    if (st.queue.length) {
      lines.push("**Up Next:**");
      st.queue.slice(0, 10).forEach((it, i) => lines.push(`${i + 1}. ${it.title || it.input}`));
      if (st.queue.length > 10) lines.push(`...and ${st.queue.length - 10} more`);
    } else lines.push("_No upcoming tracks._");
    return sendLongReply(interaction, lines.join("\n"));
  },
};
