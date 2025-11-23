const { SlashCommandBuilder } = require("discord.js");
const { getWaifuImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('waifu')
    .setDescription('Gửi một ảnh waifu (SFW).'),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const imageUrl = await getWaifuImage();

      await interaction.editReply({
        content: '💖 Waifu của bạn đây:',
        embeds: [
          {
            title: 'Random Waifu',
            image: { url: imageUrl },
            footer: { text: 'Nguồn: waifu.pics' }
          }
        ]
      });
    } catch (err) {
      console.error('Error in /waifu command:', err);
      await interaction.editReply('❌ Có lỗi khi gọi API. Thử lại sau nhé.');
    }
  }
};