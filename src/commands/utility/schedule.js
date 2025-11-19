const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const { ephemeralOpt } = require("../../utils/discordHelpers");

// Giới hạn thời gian tối đa cho setTimeout (khoảng 24.8 ngày)
const MAX_TIMEOUT_MS = 2147483647;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Lên lịch gửi một tin nhắn hoặc tệp đính kèm vào một kênh.')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Kênh bạn muốn gửi tin nhắn đến.')
        .addChannelTypes(ChannelType.GuildText) // Chỉ cho phép chọn kênh text
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Ngày gửi tin nhắn. Định dạng: YYYY-MM-DD (ví dụ: 2025-12-31)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Thời gian gửi tin nhắn (24h). Định dạng: HH:MM (ví dụ: 07:30 hoặc 19:00)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Nội dung tin nhắn cần gửi.')
        .setRequired(false))
    .addAttachmentOption(option =>
      option.setName('attachment')
        .setDescription('Tệp đính kèm (ảnh, video...) cần gửi.')
        .setRequired(false)),

  async execute(interaction) {
    // Chỉ cho phép admin hoặc người có quyền quản lý kênh sử dụng
    if (!interaction.member.permissions.has('ManageChannels')) {
        return interaction.reply({
            content: '❌ Bạn không có quyền sử dụng lệnh này.',
            ephemeral: true,
        });
    }

    try {
        const channel = interaction.options.getChannel('channel');
        const dateStr = interaction.options.getString('date');
        const timeStr = interaction.options.getString('time');
        const message = interaction.options.getString('message');
        const attachment = interaction.options.getAttachment('attachment');

        // --- Kiểm tra đầu vào ---
        if (!message && !attachment) {
            return interaction.reply({
                content: '❌ Bạn phải cung cấp ít nhất một nội dung tin nhắn hoặc một tệp đính kèm.',
                ephemeral: true
            });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) {
            return interaction.reply({
                content: '❌ Định dạng ngày hoặc giờ không hợp lệ. Vui lòng sử dụng `YYYY-MM-DD` và `HH:MM`.',
                ephemeral: true
            });
        }

        // --- Xử lý thời gian ---
        const scheduleDate = new Date(`${dateStr}T${timeStr}:00`);
        if (isNaN(scheduleDate.getTime())) {
            return interaction.reply({ content: '❌ Ngày hoặc giờ không hợp lệ.', ephemeral: true });
        }

        const delay = scheduleDate.getTime() - Date.now();

        if (delay <= 0) {
            return interaction.reply({ content: '❌ Không thể lên lịch cho một thời điểm trong quá khứ.', ephemeral: true });
        }
        if (delay > MAX_TIMEOUT_MS) {
            return interaction.reply({ content: `❌ Thời gian lên lịch quá xa (tối đa khoảng 24 ngày).`, ephemeral: true });
        }

        // --- Lên lịch tác vụ ---
        console.log(`⏰ Đã lên lịch một tác vụ cho kênh ${channel.name} sau ${delay}ms.`);

        setTimeout(async () => {
            console.log(`🚀 Thực hiện tác vụ đã lên lịch cho kênh ${channel.name}.`);
            try {
                const targetChannel = await interaction.client.channels.fetch(channel.id);
                if (!targetChannel) return;

                const payload = {};
                if (message) payload.content = message;
                if (attachment) payload.files = [attachment.url];

                await targetChannel.send(payload);

            } catch (err) {
                console.error(`❌ Lỗi khi thực hiện tác vụ đã lên lịch:`, err);
            }
        }, delay);

        // --- Phản hồi cho người dùng ---
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('✅ Lên lịch thành công!')
            .setDescription(`Tin nhắn của bạn đã được lên lịch để gửi tới kênh ${channel}.`)
            .addFields(
                { name: 'Thời gian gửi', value: `<t:${Math.floor(scheduleDate.getTime() / 1000)}:F>` },
                { name: 'Nội dung', value: message || '*(Không có tin nhắn text)*' },
                { name: 'Tệp đính kèm', value: attachment ? attachment.name : '*(Không có)*' }
            )
            .setFooter({ text: 'Lưu ý: Lịch trình sẽ bị hủy nếu bot khởi động lại.' });

        await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (err) {
      console.error('Lỗi trong lệnh /schedule:', err);
      await interaction.reply({
          content: '❌ Đã có lỗi xảy ra khi xử lý lệnh.',
          ephemeral: true
      });
    }
  }
};