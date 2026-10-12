require("dotenv").config();

const { initErrorReportService, captureCrash } = require("./services/errorReportService");

process.on("unhandledRejection", (reason, promise) => {
  console.error("[AntiCrash] Unhandled Rejection:", reason);
  captureCrash({ error: reason, origin: "Process unhandledRejection" }).catch(() => {});
});

process.on("uncaughtException", (error, origin) => {
  console.error("[AntiCrash] Uncaught Exception:", error, "origin:", origin);
  captureCrash({ error, origin: `Process uncaughtException (${origin})` }).catch(() => {});
});

process.on("warning", (warning) => {
  if (warning.name === "TimeoutNegativeWarning") return;
  if (warning.message && warning.message.includes('Supplying "ephemeral" for interaction response options is deprecated')) return;
  console.warn(`[Process Warning: ${warning.name}]`, warning.message);
});

const { Client, GatewayIntentBits, Events } = require("discord.js");
const { loadInteractions } = require("./handlers/interactionHandler");
const { registerCoreEvents } = require("./handlers/eventHandler");
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const { startScheduledTasks } = require('./handlers/scheduleHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
});

initErrorReportService(client);

app.get('/', (req, res) => {
  res.status(200).send('Bot is alive!');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Web server listening on port ${port}`);
});


(async () => {
  await registerCoreEvents(client);

  client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    startScheduledTasks(client);
  });

  await loadInteractions(client);

  await client.login(process.env.TOKEN);
})();

