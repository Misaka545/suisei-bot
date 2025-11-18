const { SlashCommandBuilder } = require("discord.js");
const { getMemeImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Gửi một ảnh meme ngẫu nhiên.'),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const meme = await getMemeImage();

      await interaction.editReply({
        content: '🤣 Meme random tới rồi:',
        embeds: [
          {
            title: meme.title,
            url: meme.postLink,
            image: { url: meme.url },
            footer: { text: `Subreddit: ${meme.subreddit}` }
          }
        ]
      });
    } catch (err) {
      console.error('Error in /meme command:', err);
      await interaction.editReply('❌ Có lỗi khi gọi API. Thử lại sau nhé.');
    }
  }
};