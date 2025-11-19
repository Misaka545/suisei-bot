require("dotenv").config();

const { Client, GatewayIntentBits, Events } = require("discord.js");
const { loadInteractions } = require("./handlers/interactionHandler");
const { registerCoreEvents } = require("./handlers/eventHandler");
const express = require('express');
const app = express();
const port = process.env.PORT || 3000; 
const { startScheduledTasks } = require('./handlers/scheduleHandler');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

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

