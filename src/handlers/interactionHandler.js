const fs = require("fs");
const path = require("path");

const { handleButtonInteraction, captureCrash } = require("../services/errorReportService");

async function loadInteractions(client) {
  client.commands = new Map();

  const commandsDir = path.join(__dirname, "..", "commands");
  const groups = fs.readdirSync(commandsDir);

  for (const group of groups) {
    const groupDir = path.join(commandsDir, group);
    const cats = fs.readdirSync(groupDir);

    for (const file of cats) {
      const full = path.join(groupDir, file);
      if (!file.endsWith(".js")) continue;
      const cmd = require(full);
      if (cmd?.data?.name && typeof cmd.execute === "function") {
        client.commands.set(cmd.data.name, cmd);
      }
    }
  }

  client.on("interactionCreate", async (interaction) => {
    // Handle error alert buttons (Details & Dismiss)
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("alert_") || interaction.customId.startsWith("autofix_")) {
        try {
          return await handleButtonInteraction(interaction);
        } catch (btnErr) {
          console.error("[Alert Button Error]:", btnErr);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction, client);
    } catch (err) {
      console.error(`Command ${interaction.commandName} failed:`, err);

      // Capture crash and send alert with Auto-Fix button
      captureCrash({
        error: err,
        origin: `Command /${interaction.commandName}`,
        channel: interaction.channel,
        interaction,
        client,
      }).catch(() => {});

      const { MessageFlags } = require("discord.js");
      const msg = "❌ Command error.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });
}

module.exports = { loadInteractions };
