const { ensureVA } = require("../../utils/vaState");

const EPHEMERAL_FLAG = 1 << 6;

module.exports = async function handleVaWakeword(interaction) {
  const guildId = interaction.guild.id;
  const va = ensureVA(guildId);

  const word = (interaction.options.getString("word") || "").trim();

  if (!word) {
    return interaction.reply({
      content: "❌ Vui lòng nhập wakeword (ví dụ: `suisei`) hoặc `off`.",
      flags: EPHEMERAL_FLAG,
    });
  }

  if (word.toLowerCase() === "off") {
    va.wakeword = null;
    return interaction.reply("🔔 Wakeword **disabled**.");
  }

  if (word.length < 2) {
    return interaction.reply({
      content: "❌ Wakeword phải có **≥ 2** ký tự.",
      flags: EPHEMERAL_FLAG,
    });
  }

  va.wakeword = word;
  return interaction.reply(`🔔 Wakeword set to **${word}**`);
};
