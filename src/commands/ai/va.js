const { SlashCommandBuilder } = require("discord.js");
const { connectIfNeeded, disconnectGuild } = require("../../utils/musicState");
const { startListening, stopListening } = require("../../services/vaService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("va")
    .setDescription("Control the Voice Assistant (Voice-to-Voice)")
    .addSubcommand((sub) =>
      sub.setName("join").setDescription("Start the Voice Assistant in your current voice channel")
    )
    .addSubcommand((sub) =>
      sub.setName("leave").setDescription("Stop the Voice Assistant and make the bot leave")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const voiceChannel = member?.voice?.channel;

    if (subcommand === "join") {
      if (!voiceChannel) {
        return interaction.reply({ content: "❌ You need to be in a voice channel first!", ephemeral: true });
      }

      await interaction.deferReply();

      try {
        const st = await connectIfNeeded(interaction, voiceChannel, { selfDeaf: false });
        if (!st || !st.connection) {
          throw new Error("Failed to connect");
        }

        const me = voiceChannel.guild.members.me;
        if (me?.voice?.deaf) await me.voice.setDeaf(false);
        if (me?.voice?.mute) await me.voice.setMute(false);
        startListening(st.connection, voiceChannel);

        await interaction.editReply("🎙️ **Voice Assistant started!** I'm listening to the voice channel...");
      } catch (err) {
        console.error("[VA join error]", err);
        await interaction.editReply("❌ Failed to start Voice Assistant.");
      }
    } else if (subcommand === "leave") {
      await interaction.deferReply();
      stopListening(guildId);
      disconnectGuild(guildId);
      await interaction.editReply("🔇 **Voice Assistant stopped.** I've stopped listening.");
    }
  },
};
