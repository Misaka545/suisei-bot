const { SlashCommandBuilder } = require("discord.js");
const { getHentaiImage } = require("../../services/imageService");

// KHÔNG CẦN hàm delay ở đây nữa

module.exports = {
  data: new SlashCommandBuilder()
    .setName('multihentai')
    .setDescription('Gửi 3 ảnh/gif hentai. Sẽ random nếu không chọn type.') // Cập nhật mô tả
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Chọn loại kết quả bạn muốn (mặc định là random)')
        .setRequired(false)
        .addChoices(
          { name: 'Ảnh (Image)', value: 'image' },
          { name: 'GIF (Animated)', value: 'gif' }
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
      const promises = [];

      // Quay trở lại vòng lặp 3 lần
      for (let i = 0; i < 3; i++) {
        let isGif;
        if (userType) {
          isGif = (userType === 'gif');
        } else {
          isGif = Math.random() < 0.5;
        }
        // Thêm promise vào mảng để thực thi song song
        promises.push(getHentaiImage(isGif));
      }

      // Sử dụng Promise.all để chạy tất cả các yêu cầu cùng lúc (không delay)
      const results = await Promise.all(promises);
      const validUrls = results.filter(url => url);

      if (validUrls.length === 0) {
        return interaction.editReply(`⚠️ Không tìm thấy kết quả nào. API có thể đang gặp sự cố.`);
      }

      const embeds = validUrls.map(url => ({
        image: { url: url },
        footer: { text: 'Nguồn: waifu.im' } // Thêm footer để ghi nguồn
      }));
      
      const contentMessage = `🔞 ${validUrls.length} kết quả hentai cho bạn:`;

      await interaction.editReply({
        content: contentMessage,
        embeds: embeds
      });

    } catch (err) {
      console.error('Error in /multihentai command:', err);
      await interaction.editReply('❌ Có lỗi nghiêm trọng khi gọi API. Thử lại sau nhé.');
    }
  }
};