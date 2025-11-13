const { SlashCommandBuilder } = require("discord.js");
const { getHentaiImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('multihentai')
    .setDescription('Gửi 3 ảnh/video hentai cùng lúc. Sẽ random nếu không chọn type.')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Chọn loại kết quả bạn muốn (mặc định là random)')
        .setRequired(false) // Optional
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
      const promises = [];

      // Create 3 requests to the API
      for (let i = 0; i < 3; i++) {
        let isGif;
        if (userType) {
          isGif = (userType === 'gif' || userType === 'video');
        } else {
          // Randomize for each of the 3 results if no type is chosen
          isGif = Math.random() < 0.5;
        }
        promises.push(getHentaiImage(isGif));
      }

      // Await all promises to run them in parallel for speed
      const results = await Promise.all(promises);
      const validUrls = results.filter(url => url); // Filter out any null results

      if (validUrls.length === 0) {
        return interaction.editReply(`⚠️ Không tìm thấy kết quả nào. API có thể đang gặp sự cố.`);
      }

      // Create an embed for each valid URL
      const embeds = validUrls.map(url => ({
        image: { url: url },
        footer: { text: 'Nguồn: waifu.im (NSFW)' }
      }));
      
      const contentMessage = `🔞 ${validUrls.length} kết quả hentai cho bạn:`;

      await interaction.editReply({
        content: contentMessage,
        embeds: embeds // Discord supports sending up to 10 embeds at once
      });

    } catch (err) {
      console.error('Error in /multihentai command:', err);
      await interaction.editReply('❌ Có lỗi nghiêm trọng khi gọi API. Thử lại sau nhé.');
    }
  }
};