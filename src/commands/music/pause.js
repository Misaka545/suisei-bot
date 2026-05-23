const { SlashCommandBuilder } = require("discord.js");
const { music } = require("../../utils/musicState");

module.exports = {
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause playback"),
  async execute(interaction) {
    const st = music.get(interaction.guild.id);
    if (!st || !st.player || !st.connection) return interaction.reply("❌ Nothing is playing.");
    return interaction.reply(st.player.pause(true) ? "⏸️ Paused." : "⚠️ Already paused or cannot pause.");
  },
};
