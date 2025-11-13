const { SlashCommandBuilder } = require("discord.js");
const { getHentaiImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hentai')
    .setDescription('Gửi ảnh, gif, hoặc video hentai. Sẽ random nếu không chọn type.')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Chọn loại kết quả bạn muốn (mặc định là random)')
        .setRequired(false) // This is now optional
        .addChoices(
          { name: 'Ảnh (Image)', value: 'image' },
          { name: 'GIF (Animated)', value: 'gif' },
          { name: 'Video (Animated)', value: 'video' }
        )),
  async execute(interaction) {
    if (!interaction.channel || !interaction.channel.nsfw) {
      return interaction.reply({
        content: '❌ Lệnh này chỉ dùng được trong **NSFW channel**.',
        ephemeral: true
      });
    }

    try {
      await interaction.deferReply();

      const userType = interaction.options.getString('type');
      let isGif;

      if (userType) {
        // If user chose a type, use it
        isGif = (userType === 'gif' || userType === 'video');
      } else {
        // If user did not choose, randomize it (50% chance for a GIF)
        isGif = Math.random() < 0.5;
      }

      const imageUrl = await getHentaiImage(isGif);

      if (!imageUrl) {
        const finalType = userType || (isGif ? 'gif' : 'image');
        return interaction.editReply(`⚠️ Không tìm thấy kết quả nào cho loại '${finalType}'.`);
      }

      const finalTypeDisplay = userType || (isGif ? 'random GIF' : 'random Image');
      const contentMessage = `🔞 Hentai (${finalTypeDisplay}) cho bạn:`;

      await interaction.editReply({
        content: contentMessage,
        embeds: [
          {
            title: 'NSFW Hentai',
            image: { url: imageUrl },
            footer: { text: 'Nguồn: waifu.im (NSFW)' }
          }
        ]
      });
    } catch (err) {
      console.error('Error in /hentai command:', err);
      await interaction.editReply('❌ Có lỗi nghiêm trọng khi gọi API. Thử lại sau nhé.');
    }
  }
};