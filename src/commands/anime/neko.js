const { SlashCommandBuilder } = require("discord.js");
const { getNekoImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('neko')
    .setDescription('Gửi một ảnh neko (SFW).'),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const imageUrl = await getNekoImage();

      await interaction.editReply({
        content: '🐾 Neko dễ thương đây nè:',
        embeds: [
          {
            title: 'Random Neko',
            image: { url: imageUrl },
            footer: { text: 'Nguồn: waifu.pics' }
          }
        ]
      });
    } catch (err) {
      console.error('Error in /neko command:', err);
      await interaction.editReply('❌ Có lỗi khi gọi API. Thử lại sau nhé.');
    }
  }
};