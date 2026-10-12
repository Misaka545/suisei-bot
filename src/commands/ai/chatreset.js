const { SlashCommandBuilder } = require("discord.js");
const { ensureChat, defaultPersona } = require("../../utils/aiChatState");

module.exports = {
  data: new SlashCommandBuilder().setName("chatreset").setDescription("Clear chat memory in this channel"),
  async execute(interaction) {
    const s = ensureChat(interaction.channelId);
    s.persona = defaultPersona();
    s.memory = [];
    s.model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    s.history = [];
    await interaction.reply("🧹 Chat memory reset for this channel.");
  },
};
