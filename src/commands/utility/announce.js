const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { ephemeralOpt } = require("../../utils/discordHelpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Gửi thông báo (hỗ trợ Ảnh và Video) ra kênh hiện tại.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Nội dung thông báo. Dùng "\\n" để xuống dòng. Gõ @everyone để ping.')
        .setRequired(true))
    .addAttachmentOption(option =>
      option.setName('file') // Đổi tên từ 'image' sang 'file' cho đúng nghĩa
        .setDescription('Đính kèm Ảnh hoặc Video cho thông báo.')
        .setRequired(false)),  
  
  async execute(interaction) {
    try {
        // Defer trước để tránh timeout nếu upload file nặng
        await interaction.deferReply({ ...ephemeralOpt(true) });

        const customMessage = interaction.options.getString('message').replace(/\\n/g, '\n');
        const attachment = interaction.options.getAttachment('file'); 

        // Payload cơ bản
        const payload = {
            content: customMessage,
        };

        // Xử lý tệp đính kèm (nếu có)
        if (attachment) {
            // Kiểm tra loại file dựa trên content type
            const isImage = attachment.contentType && attachment.contentType.startsWith('image/');

            if (isImage) {
                // Nếu là ẢNH: Nhét vào Embed cho đẹp
                const imageEmbed = new EmbedBuilder()
                    .setColor('#2F3136')
                    .setImage(attachment.url);
                payload.embeds = [imageEmbed];
            } else {
                // Nếu là VIDEO (hoặc file khác): Gửi dạng file đính kèm
                // Discord sẽ tự render trình phát video nếu là mp4/mov...
                payload.files = [{
                    attachment: attachment.url,
                    name: attachment.name // Giữ nguyên tên file gốc
                }];
            }
        }

        // Gửi tin nhắn ra kênh
        await interaction.channel.send(payload);

        // Phản hồi xác nhận (đã fix lỗi crash "Already acknowledged")
        await interaction.editReply({
            content: '✅ Đã gửi thông báo thành công!',
            ...ephemeralOpt(true)
        });

    } catch (err) {
      console.error('Lỗi trong lệnh /announce:', err);
      
      const errorMsg = { content: '❌ Đã có lỗi xảy ra khi thực hiện lệnh.', ...ephemeralOpt(true) };

      // Xử lý lỗi an toàn (tránh crash app nếu defer thất bại cục bộ)
      try {
          if (interaction.deferred || interaction.replied) {
              await interaction.editReply(errorMsg);
          } else {
              await interaction.reply(errorMsg);
          }
      } catch (replyError) {
          if (replyError.code === 40060) {
               // Bỏ qua lỗi 40060 (Interaction already acknowledged)
          } else {
              console.error('Error sending failure response:', replyError);
          }
      }
    }
  }
};