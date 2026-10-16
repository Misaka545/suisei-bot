require("dotenv").config();
const { Client } = require("@xhayper/discord-rpc");
const config = require("./config");

let client = null;
let currentTrackIndex = 0;
let rotationTimer = null;
let reconnectTimer = null;
let trackStartTime = Date.now();
let isConnecting = false;

function formatLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  return `[Bot RPC ${timestamp}] ${message}`;
}

function getStartTimestamp() {
  if (config.timeMode === "local") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }
  return trackStartTime;
}

async function setPresence(track) {
  if (!client || !client.user) return;

  try {
    const activity = {
      type: 2,
      details: track.details,
      state: track.state,
      startTimestamp: getStartTimestamp(),
      largeImageKey: track.largeImageKey,
      largeImageText: track.largeImageText,
      buttons: config.buttons && config.buttons.length > 0 ? config.buttons : undefined,
    };

    await client.user.setActivity(activity);
    console.log(formatLog(`Presence active: "${track.details}" - ${track.state}`));
  } catch (error) {
    console.error(formatLog(`Failed to set activity: ${error.message}`));
  }
}

function rotateTrack() {
  if (!config.tracks || config.tracks.length === 0) return;
  currentTrackIndex = (currentTrackIndex + 1) % config.tracks.length;
  if (config.resetTimestampOnRotate) {
    trackStartTime = Date.now();
  }
  const nextTrack = config.tracks[currentTrackIndex];
  setPresence(nextTrack);
}

function startRotation() {
  if (rotationTimer) clearInterval(rotationTimer);
  if (config.mode === "rotate" && config.tracks.length > 1) {
    const intervalMs = Math.max(1, config.rotationIntervalMinutes || 5) * 60 * 1000;
    rotationTimer = setInterval(rotateTrack, intervalMs);
    console.log(formatLog(`Auto-rotation active every ${config.rotationIntervalMinutes} minutes.`));
  }
}

function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
}

function scheduleReconnect(delayMs = 15000) {
  if (reconnectTimer || isConnecting) return;
  stopRotation();

  console.log(formatLog(`Retrying Discord connection in ${Math.round(delayMs / 1000)}s...`));
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await connectClient();
  }, delayMs);
}

async function connectClient() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    if (client) {
      const oldClient = client;
      client = null;
      oldClient.removeAllListeners();
      try {
        await oldClient.destroy();
      } catch (_) {}
    }

    const thisClient = new Client({
      clientId: config.clientId,
    });
    client = thisClient;

    thisClient.on("ready", async () => {
      if (client !== thisClient) return; // stale client
      isConnecting = false;
      console.log(formatLog(`Connected to Discord as user: ${thisClient.user?.username} (${thisClient.user?.tag || thisClient.user?.id})`));
      
      trackStartTime = Date.now();
      const currentTrack = config.tracks[currentTrackIndex] || config.tracks[0];
      await setPresence(currentTrack);
      startRotation();
    });

    thisClient.on("disconnected", () => {
      if (client !== thisClient) return; // stale client
      isConnecting = false;
      console.log(formatLog(`Disconnected from Discord.`));
      scheduleReconnect(15000);
    });

    await thisClient.login();
  } catch (error) {
    isConnecting = false;
    console.error(formatLog(`Connection failed (Discord might be closed): ${error.message}`));
    scheduleReconnect(15000);
  }
}

async function shutdown() {
  console.log("\n" + formatLog("Shutting down Bot RPC..."));
  stopRotation();
  if (reconnectTimer) clearTimeout(reconnectTimer);

  if (client) {
    try {
      await client.user?.clearActivity();
      await client.destroy();
    } catch (_) {}
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => {
  stopRotation();
});

console.log(formatLog("Starting Bot Rich Presence..."));
connectClient();
