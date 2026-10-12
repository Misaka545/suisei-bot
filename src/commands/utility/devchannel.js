// src/commands/utility/devchannel.js

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require("discord.js");
const { setDevChannelId, getDevChannelId, hasDevPermission } = require("../../services/errorReportService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("devchannel")
    .setDescription("Manage channels for error and crash alerts")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set channel for crash and error alerts")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel for crash and error alerts")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("view").setDescription("View current channel for crash and error alerts")
    ),

  async execute(interaction) {
    if (!hasDevPermission(interaction.member, interaction.guild)) {
      return interaction.reply({
        content: "❌ You need to be an **Admin** or **Dev** to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const targetChan = interaction.options.getChannel("channel");
      setDevChannelId(interaction.guildId, targetChan.id);
      return interaction.reply({
        content: `✅ Successfully set channel for crash and error alerts to: <#${targetChan.id}>`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "view") {
      const curChanId = getDevChannelId(interaction.guildId);
      if (curChanId) {
        return interaction.reply({
          content: `📡 Current channel for crash and error alerts: <#${curChanId}>`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        return interaction.reply({
          content: `⚠️ No channel has been set. Alerts will be sent to the channel where the error occurs or use the DEV_CHANNEL_ID variable in .env.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
