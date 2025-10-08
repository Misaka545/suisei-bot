const { ensureVA } = require("../../utils/vaState");

const EPHEMERAL_FLAG = 1 << 6;
const ALLOW = new Set(["auto", "en", "vi", "ja"]);

module.exports = async function handleVaLang(interaction) {
  const guildId = interaction.guild.id;
  const va = ensureVA(guildId);

  const code = interaction.options.getString("code");
  if (!ALLOW.has(code)) {
    return interaction.reply({
      content: "❌ Hãy dùng một trong: `auto`, `en`, `vi`, `ja`.",
      flags: EPHEMERAL_FLAG,
    });
  }

  va.lang = code;
  return interaction.reply(`🌐 TTS language set to **${code}**`);
};
