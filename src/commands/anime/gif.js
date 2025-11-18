const { SlashCommandBuilder } = require("discord.js");
const { getGifImage } = require("../../services/imageService");

const categoryChoices = [
    { name: 'hug', value: 'hug' },
    { name: 'pat', value: 'pat' },
    { name: 'kiss', value: 'kiss' },
    { name: 'slap', value: 'slap' },
    { name: 'punch', value: 'punch' },
    { name: 'cry', value: 'cry' },
    { name: 'laugh', value: 'laugh' },
    { name: 'smile', value: 'smile' },
    { name: 'blush', value: 'blush' },
    { name: 'wave', value: 'wave' },
    { name: 'highfive', value: 'highfive' },
    { name: 'handhold', value: 'handhold' },
    { name: 'poke', value: 'poke' },
    { name: 'cuddle', value: 'cuddle' },
    { name: 'kick', value: 'kick' },
    { name: 'bite', value: 'bite' },
    { name: 'feed', value: 'feed' },
    { name: 'dance', value: 'dance' },
    { name: 'happy', value: 'happy' },
    { name: 'angry', value: 'angry' },
    { name: 'bored', value: 'bored' },
    { name: 'facepalm', value: 'facepalm' },
    { name: 'sleep', value: 'sleep' },
    { name: 'waifu', value: 'waifu' },
    { name: 'neko', value: 'neko' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gif')
    .setDescription('Gửi một ảnh/GIF anime theo chủ đề được chọn.')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Chọn một chủ đề từ danh sách')
        .setRequired(true)
        .addChoices(...categoryChoices) // Thêm 25 lựa chọn vào lệnh
    ),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      
      const category = interaction.options.getString('category');
      const result = await getGifImage(category);

      if (!result) {
        return interaction.editReply(`⚠️ Không tìm thấy kết quả nào cho chủ đề '${category}'.`);
      }

      const contentMessage = `🎞️ Kết quả cho chủ đề '${category}':`;

      await interaction.editReply({
        content: contentMessage,
        embeds: [
          {
            title: `Anime GIF/Image: ${category}`,
            image: { url: result.url },
            footer: { text: `Nguồn: nekos.best - Anime: ${result.anime}` }
          }
        ]
      });
    } catch (err) {
      console.error('Error in /gif command:', err);
      await interaction.editReply('❌ Có lỗi nghiêm trọng khi gọi API. Thử lại sau nhé.');
    }
  }
};