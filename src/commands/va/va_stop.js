const { ensureVA } = require("../../utils/vaState");

const EPHEMERAL_FLAG = 1 << 6;

module.exports = async function handleVaStop(interaction) {
  const guildId = interaction.guild.id;
  const va = ensureVA(guildId);

  if (!va.active) {
    return interaction.reply({
      content: "ℹ️ Voice Assistant đang **OFF** rồi.",
      flags: EPHEMERAL_FLAG,
    });
  }

  va.active = false;
  va.processing = false;
  // (Không rời kênh voice: để nhạc/tts khác vẫn dùng. Nếu muốn rời, gọi disconnectGuild ở musicState.)

  return interaction.reply("🛑 Voice Assistant: **OFF**.");
};
