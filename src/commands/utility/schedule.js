// src/commands/utility/schedule.js
const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const { saveTask } = require("../../utils/schedulerUtils");
const { ephemeralOpt } = require("../../utils/discordHelpers");
const { v4: uuidv4 } = require('uuid');

// Giới hạn thời gian tối đa (khoảng 1 năm)
const MAX_DELAY_MS = 31536000000; 

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule a message to be sent (safely stored).')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send the message.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date (YYYY-MM-DD). Example: 2025-12-31')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Time (HH:MM). Example: 19:30')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Message content.')
        .setRequired(false))
    .addAttachmentOption(option =>
      option.setName('attachment')
        .setDescription('Attachment (Image/Video).')
        .setRequired(false)),

  async execute(interaction) {
    // Check quyền
    if (!interaction.member.permissions.has('ManageChannels')) {
        return interaction.reply({ 
            content: 'ManageChannels permission required.', 
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
                content: 'Please provide a message or attach a file.', 
                ...ephemeralOpt(true) 
            });
        }

        // Validate ngày giờ
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) {
            return interaction.reply({ 
                content: 'Invalid format. Use YYYY-MM-DD and HH:MM.', 
                ...ephemeralOpt(true) 
            });
        }

        const scheduleDate = new Date(`${dateStr}T${timeStr}:00`);
        const now = Date.now();
        const targetTime = scheduleDate.getTime();

        if (isNaN(targetTime)) return interaction.reply({ content: 'Invalid date/time.', ...ephemeralOpt(true) });
        if (targetTime <= now) return interaction.reply({ content: 'Time must be in the future.', ...ephemeralOpt(true) });
        if (targetTime - now > MAX_DELAY_MS) return interaction.reply({ content: 'Schedule is too far ahead.', ...ephemeralOpt(true) });

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
            .setAuthor({ name: 'Schedule saved!' })
            .setDescription(`The message will be sent even if the bot restarts.`)
            .addFields(
                { name: 'Send to', value: `<#${channel.id}>`, inline: true },
                { name: 'Time', value: `<t:${Math.floor(targetTime / 1000)}:F>`, inline: true },
                { name: 'Content', value: message ? (message.length > 50 ? message.substring(0, 47) + '...' : message) : '*(File)*' }
            )
            .setFooter({ text: `ID: ${task.id}` });

        await interaction.reply({ embeds: [embed], ...ephemeralOpt(true) });

    } catch (err) {
      console.error('Schedule Error:', err);
      await interaction.reply({ content: 'System error.', ...ephemeralOpt(true) });
    }
  }
};