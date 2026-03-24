const { SlashCommandBuilder } = require("discord.js");
const { getAnimeImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anime')
    .setDescription('Gửi một ảnh anime bất kỳ.'),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const imageUrl = await getAnimeImage();

      await interaction.editReply({
        content: '✨ Anime random cho bạn:',
        embeds: [
          {
            title: 'Random Anime',
            image: { url: imageUrl },
            footer: { text: 'Nguồn: waifu.pics' }
          }
        ]
      });
    } catch (err) {
      console.error('Error in /anime command:', err);
      await interaction.editReply('❌ Có lỗi khi gọi API. Thử lại sau nhé.');
    }
  }
};