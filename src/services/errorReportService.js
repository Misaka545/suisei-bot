// src/services/errorReportService.js
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");

const SETTINGS_PATH = path.join(__dirname, "..", "..", "data", "devSettings.json");

// In-memory cache of recent issues
const issuesMap = new Map(); // issueId -> issueData
const recentErrorDebounce = new Map(); // errorSignature -> timestamp

// Dev settings per guild
const devSettings = new Map(); // guildId -> { devChannelId }

let discordClient = null;

function loadDevSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      for (const [k, v] of Object.entries(data)) {
        devSettings.set(k, v);
      }
    }
  } catch (err) {
    console.warn("[ErrorReportService] Could not load devSettings:", err.message);
  }
}

function saveDevSettings() {
  try {
    const dir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj = Object.fromEntries(devSettings);
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.warn("[ErrorReportService] Could not save devSettings:", err.message);
  }
}

loadDevSettings();

/**
 * Initializes the error report service with the Discord client.
 * @param {import("discord.js").Client} client
 */
function initErrorReportService(client) {
  discordClient = client;
}

/**
 * Gets the configured dev channel ID for a guild.
 * @param {string} [guildId]
 * @returns {string|null}
 */
function getDevChannelId(guildId) {
  if (guildId && devSettings.has(guildId)) {
    const s = devSettings.get(guildId);
    if (s?.devChannelId) return s.devChannelId;
  }
  return process.env.DEV_CHANNEL_ID || process.env.SCHEDULED_CHANNEL_ID || null;
}

/**
 * Sets the dev channel ID for a guild.
 * @param {string} guildId
 * @param {string} channelId
 */
function setDevChannelId(guildId, channelId) {
  devSettings.set(guildId, { devChannelId: channelId });
  saveDevSettings();
}

/**
 * Checks if a member has Dev or Admin permissions.
 * @param {import("discord.js").GuildMember} member
 * @param {import("discord.js").Guild} guild
 * @returns {boolean}
 */
function hasDevPermission(member, guild) {
  if (!member) return false;
  if (guild && guild.ownerId === member.id) return true;
  if (member.permissions && typeof member.permissions.has === "function" && member.permissions.has("Administrator")) {
    return true;
  }
  if (member.roles?.cache) {
    if (member.roles.cache.some((r) => /(admin|dev)/i.test(r.name))) return true;
  } else if (Array.isArray(member.roles) && guild) {
    const found = member.roles.some((roleId) => {
      const r = guild.roles.cache.get(roleId);
      return r && /(admin|dev)/i.test(r.name);
    });
    if (found) return true;
  }
  return false;
}

/**
 * Parses a stack trace to find the first project file involved.
 * @param {string} stack
 * @returns {{ filePath: string|null, line: number|null, col: number|null }}
 */
function extractFileAndLineFromStack(stack) {
  if (!stack || typeof stack !== "string") return { filePath: null, line: null, col: null };

  const lines = stack.split("\n");

  for (const line of lines) {
    if (line.includes("node_modules")) continue;
    // Matches path to .js file followed by :line:col
    const m = line.match(/([a-zA-Z]:[\\/][^:\r\n\t()]+\.js|\/[^:\r\n\t()]+\.js):(\d+)(?::(\d+))?/);
    if (m) {
      const fullPath = path.normalize(m[1].trim());
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return {
            filePath: fullPath,
            line: parseInt(m[2], 10),
            col: m[3] ? parseInt(m[3], 10) : null,
          };
        }
      } catch {}
    }
  }

  return { filePath: null, line: null, col: null };
}

/**
 * Intercepts a crash or error, formats an embed with details, and alerts the Dev channel.
 * @param {object} param0
 * @param {Error|any} param0.error
 * @param {string} [param0.origin]
 * @param {import("discord.js").TextBasedChannel} [param0.channel]
 * @param {import("discord.js").CommandInteraction} [param0.interaction]
 * @param {import("discord.js").Client} [param0.client]
 * @returns {Promise<string|null>} Returns issueId if notified.
 */
async function captureCrash({ error, origin = "AntiCrash / Process", channel = null, interaction = null, client = null }) {
  const cl = client || discordClient;
  const errMsg = error?.message || String(error || "Unknown error");
  const stack = error?.stack || String(error || "");

  // Debounce identical errors within 8 seconds to prevent alert floods
  const errorSig = `${origin}:${errMsg}`;
  const now = Date.now();
  if (recentErrorDebounce.has(errorSig)) {
    const lastSeen = recentErrorDebounce.get(errorSig);
    if (now - lastSeen < 8000) {
      return null;
    }
  }
  recentErrorDebounce.set(errorSig, now);

  const issueId = `err_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const { filePath, line, col } = extractFileAndLineFromStack(stack);

  const issueData = {
    id: issueId,
    timestamp: new Date(),
    errorName: error?.name || "RuntimeError",
    errorMessage: errMsg,
    stack,
    origin,
    filePath,
    line,
    col,
    status: "open",
  };
  issuesMap.set(issueId, issueData);

  // Clean old issues if map grows too large
  if (issuesMap.size > 50) {
    const oldestKey = issuesMap.keys().next().value;
    issuesMap.delete(oldestKey);
  }

  // Determine target channel to send notification
  let targetChannel = null;
  const guildId = channel?.guildId || interaction?.guildId;
  const devChanId = getDevChannelId(guildId);

  if (cl && devChanId) {
    targetChannel = cl.channels.cache.get(devChanId) || (await cl.channels.fetch(devChanId).catch(() => null));
  }
  if (!targetChannel && channel?.isTextBased?.()) {
    targetChannel = channel;
  }

  if (!targetChannel) {
    console.warn(`[ErrorReportService] No dev channel found to dispatch alert for issue ${issueId}`);
    return issueId;
  }

  const relativeFile = filePath ? path.relative(path.resolve(__dirname, "..", ".."), filePath) : "Unknown";

  const embed = new EmbedBuilder()
    .setTitle(`🚨 Runtime Error Detected: ${issueData.errorName}`)
    .setColor(0xff3366)
    .setDescription(`An unexpected error occurred during execution. Diagnostic details are provided below:`)
    .addFields(
      { name: "📍 Error source", value: `\`${origin}\``, inline: true },
      { name: "📁 File & Line", value: `\`${relativeFile}${line ? `:${line}` : ""}\``, inline: true },
      { name: "⚠️ Error message", value: `\`\`\`${errMsg.slice(0, 800)}\`\`\`` },
      {
        name: "🔍 Stack Trace",
        value: `\`\`\`${stack.split("\n").slice(0, 8).join("\n").slice(0, 1000)}\`\`\``,
      }
    )
    .setFooter({ text: `Issue ID: ${issueId} • Error Reporter` })
    .setTimestamp();

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`alert_details_${issueId}`)
      .setLabel("📋 Details")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`alert_dismiss_${issueId}`)
      .setLabel("❌ Dismiss")
      .setStyle(ButtonStyle.Danger)
  );

  try {
    await targetChannel.send({ embeds: [embed], components: [actionRow] });
    console.log(`[ErrorReportService] Sent error alert (${issueId}) to #${targetChannel.name || targetChannel.id}`);
  } catch (sendErr) {
    console.error("[ErrorReportService] Failed to send error alert:", sendErr.message);
  }

  return issueId;
}

/**
 * Handles button interactions related to error alerts (Details and Dismiss).
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleButtonInteraction(interaction) {
  if (!interaction.customId.startsWith("alert_") && !interaction.customId.startsWith("autofix_")) return;

  const parts = interaction.customId.split("_");
  const action = parts[1]; // "details" or "dismiss"
  const issueId = parts.slice(2).join("_");

  const issue = issuesMap.get(issueId);
  if (!issue && action !== "dismiss") {
    return interaction.reply({
      content: "⚠️ Issue details have expired or the bot has been restarted.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Permission check
  if (!hasDevPermission(interaction.member, interaction.guild)) {
    return interaction.reply({
      content: "❌ You need Administrator permission or Dev/Admin role to interact with this alert.",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === "dismiss") {
    if (issue) issue.status = "dismissed";
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("disabled_dismiss").setLabel("Dismissed").setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    await interaction.update({ components: [disabledRow] }).catch(() => {});
    return;
  }

  if (action === "details") {
    let detailContent = `📋 **Issue Details [${issue.id}]**\n`;
    detailContent += `**Time:** <t:${Math.floor(new Date(issue.timestamp).getTime() / 1000)}:F>\n`;
    detailContent += `**File:** \`${issue.filePath || "Unknown"}${issue.line ? `:${issue.line}` : ""}\`\n`;
    detailContent += `**Origin:** \`${issue.origin}\`\n\n`;
    detailContent += `**Error Message:**\n\`\`\`\n${issue.errorMessage.slice(0, 500)}\n\`\`\`\n`;
    detailContent += `**Full Stack Trace:**\n\`\`\`js\n${issue.stack.slice(0, 1500)}\n\`\`\``;

    return interaction.reply({ content: detailContent, flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  initErrorReportService,
  initAntigravityService: initErrorReportService, // Backward compatibility alias
  getDevChannelId,
  setDevChannelId,
  hasDevPermission,
  captureCrash,
  handleButtonInteraction,
};
