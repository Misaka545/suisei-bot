const { SlashCommandBuilder } = require("discord.js");
const { music, disconnectGuild } = require("../../utils/musicState");

module.exports = {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback and clear the queue"),
  async execute(interaction) {
    const st = music.get(interaction.guild.id);
    if (!st || (!st.player && (!st.queue || st.queue.length === 0)))
      return interaction.reply("ℹ️ Nothing to stop.");
    disconnectGuild(interaction.guild.id);
    return interaction.reply("🛑 Stopped and cleared the queue.");
  },
};
