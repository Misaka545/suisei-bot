const { SlashCommandBuilder } = require("discord.js");
const { music } = require("../../utils/musicState");

function shuffleQueueArray(q) {
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
}

module.exports = {
  data: new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the upcoming queue"),
  async execute(interaction) {
    const st = music.get(interaction.guild.id);
    if (!st || !st.queue) return interaction.reply("📭 Queue is empty.");
    if (st.queue.length < 2) return interaction.reply("ℹ️ Need at least 2 tracks to shuffle.");
    shuffleQueueArray(st.queue);
    return interaction.reply(`🔀 Shuffled ${st.queue.length} upcoming track${st.queue.length === 1 ? "" : "s"}.`);
  },
};
