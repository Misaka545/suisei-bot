const { MessageFlags } = require("discord.js");

const EPHEMERAL_FLAG =
  MessageFlags && MessageFlags.Ephemeral ? MessageFlags.Ephemeral : 1 << 6;

const MAX_DISCORD = 2000;

function chunkText(text, size = MAX_DISCORD) {
  if (!text) return [""];
  const p = [];
  for (let i = 0; i < text.length; i += size) p.push(text.slice(i, i + size));
  return p;
}
const ephemeralOpt = (isEphemeral) => (isEphemeral ? { flags: EPHEMERAL_FLAG } : {});

async function sendLongReply(interaction, text, { ephemeral = false } = {}) {
  const parts = chunkText(text);
  if (!(interaction.deferred || interaction.replied))
    await interaction.reply({ content: parts[0], ...ephemeralOpt(ephemeral) });
  else await interaction.followUp({ content: parts[0], ...ephemeralOpt(ephemeral) });
  for (let i = 1; i < parts.length; i++)
    await interaction.followUp({ content: parts[i], ...ephemeralOpt(ephemeral) });
}

async function editOrFollowLong(interaction, text, { ephemeral = false } = {}) {
  const parts = chunkText(text);
  await interaction.editReply({ content: parts[0] });
  for (let i = 1; i < parts.length; i++)
    await interaction.followUp({ content: parts[i], ...ephemeralOpt(ephemeral) });
}

module.exports = {
  EPHEMERAL_FLAG,
  chunkText,
  ephemeralOpt,
  sendLongReply,
  editOrFollowLong,
};
