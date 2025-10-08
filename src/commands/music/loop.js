const { SlashCommandBuilder } = require("discord.js");
const { ensureMusic } = require("../../utils/musicState");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("loop").setDescription("Set loop mode")
    .addStringOption((opt) =>
      opt.setName("mode").setDescription("off | track | queue").setRequired(true)
        .addChoices({ name: "off", value: "off" }, { name: "track", value: "track" }, { name: "queue", value: "queue" })),
  async execute(interaction) {
    const mode = interaction.options.getString("mode");
    const st = ensureMusic(interaction.guild.id);
    if (!["off", "track", "queue"].includes(mode))
      return interaction.reply("❌ Invalid mode. Use: off, track, or queue.");
    st.loopMode = mode;
    return interaction.reply(`🔁 Loop mode set to **${mode}**.`);
  },
};
