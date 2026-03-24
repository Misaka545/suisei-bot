const { SlashCommandBuilder } = require("discord.js");
const { ensureChat, defaultPersona } = require("../../utils/aiChatState");

module.exports = {
  data: new SlashCommandBuilder().setName("chatreset").setDescription("Clear chat memory in this channel"),
  async execute(interaction) {
    const s = ensureChat(interaction.channelId, process.env.GEMINI_MODEL || "gemini-2.5-flash");
    s.persona = defaultPersona();
    s.memory = [];
    s.model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    s.history = [];
    await interaction.reply("🧹 Chat memory reset for this channel.");
  },
};
