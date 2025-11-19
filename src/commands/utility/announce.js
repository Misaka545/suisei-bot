const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { ephemeralOpt } = require("../../utils/discordHelpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Gửi một thông báo (tùy chọn kèm hình ảnh) ra kênh hiện tại.') // Cập nhật mô tả
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Nội dung thông báo. Dùng "\\n" để xuống dòng. Gõ @everyone để ping.')
        .setRequired(true))
    .addAttachmentOption(option =>
      option.setName('image')
        .setDescription('Hình ảnh hoặc sticker (tùy chọn) đính kèm thông báo.')
        .setRequired(false)),  
  
  async execute(interaction) {
    try {
        await interaction.deferReply({ ...ephemeralOpt(true) });

        const customMessage = interaction.options.getString('message').replace(/\\n/g, '\n');
        // `image` bây giờ có thể là null nếu người dùng không cung cấp
        const image = interaction.options.getAttachment('image'); 

        // Tạo một đối tượng payload để xây dựng tin nhắn
        const payload = {
            content: customMessage,
        };

        // THÊM LOGIC ĐIỀU KIỆN TẠI ĐÂY:
        // Chỉ thêm embed nếu người dùng có cung cấp hình ảnh
        if (image) {
            const imageEmbed = new EmbedBuilder()
                .setColor('#2F3136')
                .setImage(image.url);
            
            payload.embeds = [imageEmbed];
        }

        // Gửi payload đã được xây dựng hoàn chỉnh
        await interaction.channel.send(payload);

        // Phản hồi xác nhận cho người dùng
        await interaction.editReply({
            content: '✅ Đã gửi thông báo thành công!',
            ...ephemeralOpt(true)
        });

    } catch (err) {
      console.error('Lỗi trong lệnh /announce:', err);
      if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: '❌ Đã có lỗi xảy ra khi thực hiện lệnh.', ...ephemeralOpt(true) });
      } else {
          await interaction.reply({ content: '❌ Đã có lỗi xảy ra khi thực hiện lệnh.', ...ephemeralOpt(true) });
      }
    }
  }
};