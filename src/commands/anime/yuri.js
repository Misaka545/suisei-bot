const { SlashCommandBuilder } = require("discord.js");
const { getYuriImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('yuri')
    .setDescription('Gửi ảnh yuri (NSFW, chỉ trong NSFW channel).'),
  async execute(interaction) {
    // NSFW channel check
    if (!interaction.channel || !interaction.channel.nsfw) {
      return interaction.reply({
        content: '❌ Lệnh này chỉ dùng được trong **NSFW channel**.',
        ephemeral: true
      });
    }

    try {
      await interaction.deferReply();
      const imageUrl = await getYuriImage();

      await interaction.editReply({
        content: '🔞 Yuri cho bạn:',
        embeds: [
          {
            title: 'NSFW Yuri',
            image: { url: imageUrl },
            footer: { text: 'Nguồn: waifu.im (NSFW)' }
          }
        ]
      });
    } catch (err) {
      console.error('Error in /yuri command:', err);
      await interaction.editReply('❌ Có lỗi khi gọi API. Thử lại sau nhé.');
    }
  }
};