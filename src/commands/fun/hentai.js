const { SlashCommandBuilder } = require("discord.js");
const { getHentaiImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hentai')
    .setDescription('Gửi ảnh hoặc video hentai (chỉ trong NSFW channel).')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Chọn loại kết quả (ảnh hoặc video/gif)')
        .setRequired(true)
        .addChoices(
          { name: 'Ảnh (Image)', value: 'image' },
          { name: 'Video / GIF', value: 'gif' }
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

      const type = interaction.options.getString('type');
      const isGif = (type === 'gif'); // Convert the choice to a boolean

      const imageUrl = await getHentaiImage(isGif);

      if (!imageUrl) {
        return interaction.editReply(`⚠️ Không tìm thấy kết quả nào cho loại '${type}'. Thử lại sau nhé!`);
      }

      await interaction.editReply({
        content: `🔞 Hentai ${type} cho bạn:`,
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