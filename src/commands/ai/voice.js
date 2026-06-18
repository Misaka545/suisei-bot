// src/commands/ai/voice.js
// Slash command for managing VOICEVOX voice settings

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { listSpeakers, synthesize, isAvailable } = require("../../services/voicevoxService");
const { getSpeakerId, setSpeakerId } = require("../../utils/voiceSettings");
const { speakResourceToChannel } = require("../../services/ttsService");
const { connectIfNeeded } = require("../../utils/musicState");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Manage Suisei's VOICEVOX voice settings")
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all available VOICEVOX speakers")
    )
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set the default voice for this server")
        .addIntegerOption((opt) =>
          opt
            .setName("speaker_id")
            .setDescription("Speaker/style ID from /voice list")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("preview")
        .setDescription("Preview a voice in your voice channel")
        .addIntegerOption((opt) =>
          opt
            .setName("speaker_id")
            .setDescription("Speaker/style ID to preview")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("current")
        .setDescription("Show the current voice setting for this server")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Check VOICEVOX availability for all subcommands
    const available = await isAvailable();
    if (!available) {
      return interaction.reply({
        content: "❌ VOICEVOX engine is not running! Please start it with:\n```\ndocker compose -f voicevox-docker-compose.yml up -d\n```",
        ephemeral: true,
      });
    }

    if (subcommand === "list") {
      await interaction.deferReply();

      try {
        const speakers = await listSpeakers();

        // Build paginated embed with speaker info
        const lines = [];
        for (const speaker of speakers) {
          for (const style of speaker.styles) {
            lines.push(`\`${String(style.id).padStart(3)}\` — **${speaker.name}** (${style.name})`);
          }
        }

        // Split into chunks of 15 for readability (so it fits well in an embed)
        const PAGE_SIZE = 15;
        const pages = [];
        for (let i = 0; i < lines.length; i += PAGE_SIZE) {
          pages.push(lines.slice(i, i + PAGE_SIZE).join("\n"));
        }

        const currentSpeaker = getSpeakerId(interaction.guildId);
        let currentPage = 0;

        const generateEmbed = (page) => {
          return new EmbedBuilder()
            .setAuthor({ name: "Available VOICEVOX Speakers" })
            .setDescription(pages[page])
            .setColor("#7c3aed")
            .setFooter({
              text: `Current server voice: ID ${currentSpeaker} • Use /voice set <id> to change • Page ${page + 1}/${pages.length}`
            });
        };

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

        const generateRow = (page) => {
          return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("voice_list_prev")
              .setLabel("⬅️")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page === 0),
            new ButtonBuilder()
              .setCustomId("voice_list_next")
              .setLabel("➡️")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page === pages.length - 1)
          );
        };

        const response = await interaction.editReply({
          embeds: [generateEmbed(currentPage)],
          components: pages.length > 1 ? [generateRow(currentPage)] : [],
        });

        if (pages.length > 1) {
          const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120_000, // 2 phút tương tác
          });

          collector.on("collect", async (i) => {
            if (i.user.id !== interaction.user.id) {
              return i.reply({ content: "❌ You are not the one who used this command!", ephemeral: true });
            }

            if (i.customId === "voice_list_prev" && currentPage > 0) {
              currentPage--;
            } else if (i.customId === "voice_list_next" && currentPage < pages.length - 1) {
              currentPage++;
            }

            await i.update({
              embeds: [generateEmbed(currentPage)],
              components: [generateRow(currentPage)],
            });
          });

          collector.on("end", () => {
            interaction.editReply({ components: [] }).catch(() => {});
          });
        }
      } catch (err) {
        console.error("[Voice List] Error:", err);
        await interaction.editReply({
          content: `❌ Failed to fetch speakers: ${err.message}`,
        });
      }
    } else if (subcommand === "set") {
      const speakerId = interaction.options.getInteger("speaker_id");
      await interaction.deferReply({ ephemeral: true });

      try {
        // Verify the speaker ID is valid
        const speakers = await listSpeakers();
        let found = null;
        for (const speaker of speakers) {
          for (const style of speaker.styles) {
            if (style.id === speakerId) {
              found = { name: speaker.name, style: style.name };
              break;
            }
          }
          if (found) break;
        }

        if (!found) {
          return interaction.editReply({
            content: `❌ Speaker ID \`${speakerId}\` not found. Use \`/voice list\` to see available speakers.`,
          });
        }

        setSpeakerId(interaction.guildId, speakerId);

        await interaction.editReply({
          content: `✅ Voice changed to **${found.name}** (${found.style}) — ID \`${speakerId}\``,
        });
      } catch (err) {
        console.error("[Voice Set] Error:", err);
        await interaction.editReply({
          content: `❌ Failed to set voice: ${err.message}`,
        });
      }
    } else if (subcommand === "preview") {
      const speakerId = interaction.options.getInteger("speaker_id");

      const member = await interaction.guild.members
        .fetch(interaction.user.id)
        .catch(() => null);
      const voiceChannel = member?.voice?.channel;

      if (!voiceChannel) {
        return interaction.reply({
          content: "❌ You need to be in a voice channel to preview a voice!",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        // Verify speaker exists
        const speakers = await listSpeakers();
        let found = null;
        for (const speaker of speakers) {
          for (const style of speaker.styles) {
            if (style.id === speakerId) {
              found = { name: speaker.name, style: style.name };
              break;
            }
          }
          if (found) break;
        }

        if (!found) {
          return interaction.editReply({
            content: `❌ Speaker ID \`${speakerId}\` not found.`,
          });
        }

        // Generate preview audio
        const previewText = "こんにちは！私はスイセイです。よろしくお願いします！";
        const resource = await synthesize(previewText, speakerId);

        // Connect and play
        await connectIfNeeded(interaction, voiceChannel, {
          selfDeaf: false,
          selfMute: false,
        });
        await speakResourceToChannel(voiceChannel, resource);

        await interaction.editReply({
          content: `🎤 Playing preview of **${found.name}** (${found.style}) — ID \`${speakerId}\``,
        });
      } catch (err) {
        console.error("[Voice Preview] Error:", err);
        await interaction.editReply({
          content: `❌ Failed to preview voice: ${err.message}`,
        });
      }
    } else if (subcommand === "current") {
      const speakerId = getSpeakerId(interaction.guildId);

      try {
        const speakers = await listSpeakers();
        let found = null;
        for (const speaker of speakers) {
          for (const style of speaker.styles) {
            if (style.id === speakerId) {
              found = { name: speaker.name, style: style.name };
              break;
            }
          }
          if (found) break;
        }

        const voiceName = found
          ? `**${found.name}** (${found.style})`
          : `Unknown`;

        await interaction.reply({
          content: `🎤 Current server voice: ${voiceName} — ID \`${speakerId}\`\nUse \`/voice set <id>\` to change.`,
          ephemeral: true,
        });
      } catch (err) {
        await interaction.reply({
          content: `🎤 Current server voice: ID \`${speakerId}\`\n*(Could not fetch speaker name — VOICEVOX engine may be offline)*`,
          ephemeral: true,
        });
      }
    }
  },
};
