// src/commands/utility/schedule.js
const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const { saveTask } = require("../../utils/schedulerUtils");
const { ephemeralOpt } = require("../../utils/discordHelpers"); // Import helper để sửa lỗi warning
const { v4: uuidv4 } = require('uuid');

// Giới hạn thời gian tối đa (khoảng 1 năm)
const MAX_DELAY_MS = 31536000000; 

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Lên lịch gửi tin nhắn (Lưu trữ an toàn).')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Kênh gửi tin nhắn.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Ngày (YYYY-MM-DD). Ví dụ: 2025-12-31')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Giờ (HH:MM). Ví dụ: 19:30')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Nội dung tin nhắn.')
        .setRequired(false))
    .addAttachmentOption(option =>
      option.setName('attachment')
        .setDescription('Tệp đính kèm (Ảnh/Video).')
        .setRequired(false)),

  async execute(interaction) {
    // Check quyền
    if (!interaction.member.permissions.has('ManageChannels')) {
        return interaction.reply({ 
            content: '❌ Cần quyền ManageChannels.', 
            ...ephemeralOpt(true) 
        });
    }

    try {
        const channel = interaction.options.getChannel('channel');
        const dateStr = interaction.options.getString('date');
        const timeStr = interaction.options.getString('time');
        const message = interaction.options.getString('message');
        const attachment = interaction.options.getAttachment('attachment');

        if (!message && !attachment) {
            return interaction.reply({ 
                content: '❌ Cần nhập tin nhắn hoặc đính kèm file.', 
                ...ephemeralOpt(true) 
            });
        }

        // Validate ngày giờ
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) {
            return interaction.reply({ 
                content: '❌ Sai định dạng. Dùng YYYY-MM-DD và HH:MM.', 
                ...ephemeralOpt(true) 
            });
        }

        const scheduleDate = new Date(`${dateStr}T${timeStr}:00`);
        const now = Date.now();
        const targetTime = scheduleDate.getTime();

        if (isNaN(targetTime)) return interaction.reply({ content: '❌ Ngày giờ không hợp lệ.', ...ephemeralOpt(true) });
        if (targetTime <= now) return interaction.reply({ content: '❌ Thời gian phải ở tương lai.', ...ephemeralOpt(true) });
        if (targetTime - now > MAX_DELAY_MS) return interaction.reply({ content: '❌ Lịch quá xa.', ...ephemeralOpt(true) });

        // --- TẠO DỮ LIỆU TASK ---
        const task = {
            id: uuidv4(),
            channelId: channel.id,
            guildId: interaction.guild.id,
            content: message || "",
            attachmentUrl: attachment ? attachment.url : null,
            attachmentName: attachment ? attachment.name : null,
            timestamp: targetTime,
            createdBy: interaction.user.tag
        };

        // Lưu vào file JSON
        saveTask(task);

        const embed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('✅ Đã lưu lịch trình!')
            .setDescription(`Tin nhắn sẽ được gửi ngay cả khi bot khởi động lại.`)
            .addFields(
                { name: 'Gửi tới', value: `<#${channel.id}>`, inline: true },
                { name: 'Thời gian', value: `<t:${Math.floor(targetTime / 1000)}:F>`, inline: true },
                { name: 'Nội dung', value: message ? (message.length > 50 ? message.substring(0, 47) + '...' : message) : '*(File)*' }
            )
            .setFooter({ text: `ID: ${task.id}` });

        await interaction.reply({ embeds: [embed], ...ephemeralOpt(true) });

    } catch (err) {
      console.error('Schedule Error:', err);
      await interaction.reply({ content: '❌ Lỗi hệ thống.', ...ephemeralOpt(true) });
    }
  }
};