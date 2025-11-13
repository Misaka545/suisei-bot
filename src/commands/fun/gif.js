const { SlashCommandBuilder } = require("discord.js");
const { getGifImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gif')
    .setDescription('Gửi một GIF anime (SFW reaction).'),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const gif = await getGifImage();

      await interaction.editReply({
        content: '🎞 GIF anime reaction của bạn:',
        embeds: [
          {
            title: 'Anime GIF',
            image: { url: gif.url },
            footer: { text: `Nguồn: nekos.best - Anime: ${gif.anime}` }
          }
        ]
      });
    } catch (err) {
      console.error('Error in /gif command:', err);
      await interaction.editReply('❌ Có lỗi khi gọi API. Thử lại sau nhé.');
    }
  }
};