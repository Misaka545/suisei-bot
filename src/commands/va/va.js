const { SlashCommandBuilder } = require("discord.js");

// Import 4 handler thuần (KHÔNG export SlashCommandBuilder trong các file này)
const handleStart = require("./va_start");
const handleStop = require("./va_stop");
const handleLang = require("./va_lang");
const handleWakeword = require("./va_wakeword");

module.exports = {
  // ---- Slash command Duy Nhất: /va ----
  data: new SlashCommandBuilder()
    .setName("va")
    .setDescription("Voice assistant controls")
    .addSubcommand(sc =>
      sc.setName("start").setDescription("Start voice assistant (join your voice channel)")
    )
    .addSubcommand(sc =>
      sc.setName("stop").setDescription("Stop voice assistant")
    )
    .addSubcommand(sc =>
      sc
        .setName("lang")
        .setDescription("Set TTS language")
        .addStringOption(opt =>
          opt
            .setName("code")
            .setDescription("auto | en | vi | ja")
            .setRequired(true)
            .addChoices(
              { name: "auto", value: "auto" },
              { name: "English", value: "en" },
              { name: "Tiếng Việt", value: "vi" },
              { name: "日本語", value: "ja" },
            )
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("wakeword")
        .setDescription("Set a wakeword or 'off'")
        .addStringOption(opt =>
          opt
            .setName("word")
            .setDescription("e.g. suisei or 'off'")
            .setRequired(true)
        )
    ),

  // ---- Router: gọi đúng handler theo subcommand ----
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "start") return handleStart(interaction);
    if (sub === "stop") return handleStop(interaction);
    if (sub === "lang") return handleLang(interaction);
    if (sub === "wakeword") return handleWakeword(interaction);
    // fallback
    return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
  },
};
