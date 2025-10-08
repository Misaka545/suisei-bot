require("dotenv").config();

const { Client, GatewayIntentBits, Events } = require("discord.js");
const { loadInteractions } = require("./handlers/interactionHandler");
const { registerCoreEvents } = require("./handlers/eventHandler");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

(async () => {
  await registerCoreEvents(client);

  client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
  });

  await loadInteractions(client);

  await client.login(process.env.TOKEN);
})();

