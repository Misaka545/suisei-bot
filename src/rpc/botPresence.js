require("dotenv").config();
const { Client } = require("@xhayper/discord-rpc");
const config = require("./config");

const RECONNECT_INTERVAL_MS = 30 * 1000;

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

function formatError(error) {
  if (!error) return "Unknown error";
  if (error.message && error.name && error.name !== "Error") {
    return `${error.name}: ${error.message}`;
  }
  return error.message || error.name || String(error);
}

function getStartTimestamp() {
  if (config.timeMode === "local") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }
  return trackStartTime;
}

async function cleanupClient(targetClient) {
  if (!targetClient) return;
  try {
    targetClient.removeAllListeners();
    if (targetClient.transport) {
      if (targetClient.transport.heartbeatTimer) {
        clearInterval(targetClient.transport.heartbeatTimer);
        targetClient.transport.heartbeatTimer = undefined;
      }
      if (targetClient.transport.timeoutTimer) {
        clearTimeout(targetClient.transport.timeoutTimer);
        targetClient.transport.timeoutTimer = undefined;
      }
      if (targetClient.transport.socket) {
        targetClient.transport.socket.removeAllListeners();
        targetClient.transport.socket.destroy();
        targetClient.transport.socket = undefined;
      }
    }
    await targetClient.destroy();
  } catch (_) {}
}

function handleDisconnect(targetClient, reason = "") {
  if (targetClient && client !== targetClient) return;
  isConnecting = false;
  stopRotation();

  if (client) {
    const deadClient = client;
    client = null;
    cleanupClient(deadClient);
  }

  const suffix = reason ? ` (${reason})` : "";
  console.log(formatLog(`Disconnected from Discord${suffix}.`));
  scheduleReconnect(RECONNECT_INTERVAL_MS);
}

async function setPresence(track) {
  if (!client || !client.user) return;

  if (!client.isConnected) {
    handleDisconnect(client, "NOT_CONNECTED");
    return;
  }

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
    const errText = formatError(error);
    console.error(formatLog(`Failed to set activity: ${errText}`));
    if (
      !client ||
      !client.isConnected ||
      error?.name === "NOT_CONNECTED" ||
      error?.name === "CONNECTION_ENDED" ||
      error?.name === "REQUEST_TIMEOUT"
    ) {
      handleDisconnect(client, errText);
    }
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

function scheduleReconnect(delayMs = RECONNECT_INTERVAL_MS) {
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

  if (client) {
    const oldClient = client;
    client = null;
    await cleanupClient(oldClient);
  }

  const thisClient = new Client({
    clientId: config.clientId,
  });
  client = thisClient;

  try {
    thisClient.on("ready", async () => {
      if (client !== thisClient) return; // stale client
      isConnecting = false;
      console.log(formatLog(`Connected to Discord as user: ${thisClient.user?.username} (${thisClient.user?.tag || thisClient.user?.id})`));
      const socket = thisClient.transport?.socket;
      if (socket) {
        socket.once("close", () => handleDisconnect(thisClient, "IPC socket closed"));
        socket.once("end", () => handleDisconnect(thisClient, "IPC socket ended"));
        socket.on("error", (err) => handleDisconnect(thisClient, formatError(err)));
      }

      trackStartTime = Date.now();
      const currentTrack = config.tracks[currentTrackIndex] || config.tracks[0];
      await setPresence(currentTrack);
      startRotation();
    });

    thisClient.on("disconnected", () => {
      handleDisconnect(thisClient, "RPC disconnected");
    });

    await thisClient.login();
  } catch (error) {
    isConnecting = false;
    if (client === thisClient) {
      client = null;
    }
    await cleanupClient(thisClient);
    console.error(formatLog(`Connection failed (Discord might be closed): ${formatError(error)}`));
    scheduleReconnect(RECONNECT_INTERVAL_MS);
  }
}

async function shutdown() {
  console.log("\n" + formatLog("Shutting down Bot RPC..."));
  stopRotation();
  if (reconnectTimer) clearTimeout(reconnectTimer);

  if (client) {
    const activeClient = client;
    client = null;
    try {
      if (activeClient.isConnected) {
        await activeClient.user?.clearActivity();
      }
    } catch (_) {}
    await cleanupClient(activeClient);
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
