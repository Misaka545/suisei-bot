const fs = require("fs");
const path = require("path");

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
    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction, client);
    } catch (err) {
      console.error(`Command ${interaction.commandName} failed:`, err);
      const msg = "❌ Command error.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
  });
}

module.exports = { loadInteractions };
