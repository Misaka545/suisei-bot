const { SlashCommandBuilder } = require("discord.js");
const { music } = require("../../utils/musicState");

module.exports = {
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip the current track"),
  async execute(interaction) {
    const st = music.get(interaction.guild.id);
    if (!st || !st.player || !st.connection) return interaction.reply("❌ Nothing is playing.");
    st.skipping = true;
    try { st.currentProc?.kill?.(); } catch {}
    st.player.stop(true);
    return interaction.reply("⏭️ Skipped.");
  },
};
