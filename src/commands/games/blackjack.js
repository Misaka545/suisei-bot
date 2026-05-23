const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require("discord.js");
const { BlackjackGame } = require("../../games/blackjackGame");
const { connectIfNeeded, music } = require("../../utils/musicState"); // Import the 'music' map
const { createAudioResource, AudioPlayerStatus, entersState, getVoiceConnection } = require("@discordjs/voice");
const fs = require("node:fs");
const path = require("node:path");

// A map to store active blackjack games by channel ID
const activeGames = new Map();

// --- REMOVED: The separate blackjackPlayer is gone ---

// Define the base directory for our blackjack audio assets
const audioDir = path.join(__dirname, '..', '..', 'assets', 'audio', 'blackjack');
const audioFiles = {
  dealer_win: path.join(audioDir, 'dealer_win'),
  player_win: path.join(audioDir, 'player_win'),
  push: path.join(audioDir, 'push'),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Start a game of Blackjack!")
    .addStringOption((option) =>
      option
        .setName("difficulty")
        .setDescription("Choose dealer's difficulty")
        .setRequired(false)
        .addChoices(
          { name: "Easy (Dealer stands on 20)", value: "easy" },
          { name: "Hard (Dealer stands on 18)", value: "hard" }
        )
    ),
  async execute(interaction) {
    if (activeGames.has(interaction.channelId)) {
      return interaction.reply({
        content: "Một trò chơi Blackjack đang diễn ra trong kênh này. Hãy hoàn thành trò chơi đó trước!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: false });

    const chosenDifficulty = interaction.options.getString("difficulty");
    const game = new BlackjackGame(interaction.user.id, interaction.user.username, chosenDifficulty);
    activeGames.set(interaction.channelId, game);

    game.start();

    const hitButton = new ButtonBuilder().setCustomId("blackjack_hit").setLabel("Hit").setStyle(ButtonStyle.Primary);
    const standButton = new ButtonBuilder().setCustomId("blackjack_stand").setLabel("Stand").setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(hitButton, standButton);

    const endGame = async (finalGame, currentInteraction) => {
      row.components.forEach(c => c.setDisabled(true));
      const finalDisplayContent = `Trò chơi Blackjack cho ${currentInteraction.user.username} đã kết thúc!\n\n` + finalGame.getDisplay(false);

      await currentInteraction.editReply({
          content: finalDisplayContent,
          components: [row]
      }).catch(console.error);

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const voiceChannel = member?.voice?.channel;

      if (voiceChannel) {
        try {
          // Get the main connection and player from the music system
          const connectionState = await connectIfNeeded(interaction, voiceChannel, { selfDeaf: false });
          const connection = connectionState.connection || getVoiceConnection(interaction.guild.id);
          const player = connectionState.player;

          if (!connection || !player) {
            throw new Error("Could not establish voice connection or find audio player.");
          }

          const me = voiceChannel.guild.members.me;
          if (me?.voice?.deaf) await me.voice.setDeaf(false);
          if (me?.voice?.mute) await me.voice.setMute(false);

          const outcomeDir = audioFiles[finalGame.status];

          if (fs.existsSync(outcomeDir)) {
            const filesInDir = fs.readdirSync(outcomeDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg'));
            
            if (filesInDir.length > 0) {
              const randomFile = filesInDir[Math.floor(Math.random() * filesInDir.length)];
              const filePath = path.join(outcomeDir, randomFile);

              console.log(`[Blackjack] Playing audio file via MAIN player: ${filePath}`);
              
              const resource = createAudioResource(filePath);

              // --- Interruption Handling ---
              const wasPlayingMusic = player.state.status === AudioPlayerStatus.Playing;
              const musicState = music.get(interaction.guild.id);

              // Stop any currently playing music
              player.stop(true);

              // Play the blackjack sound
              player.play(resource);
              await entersState(player, AudioPlayerStatus.Playing, 5_000);

              // Wait for the sound to finish
              await entersState(player, AudioPlayerStatus.Idle, 60_000); // Wait up to 60s for sound to end

              // --- Resume Logic ---
              // If music was playing before and there's still a queue, play the next song.
              if (wasPlayingMusic && musicState && musicState.queue.length > 0) {
                 // The main player's 'idle' event listener in play.js will automatically handle this.
                 // We just need to make sure the connection isn't destroyed.
                 console.log("[Blackjack] Sound finished. Music queue will resume automatically.");
              }
            }
          }
        } catch (audioError) {
          console.error("[Blackjack] Error playing local audio file:", audioError);
          await interaction.followUp({ content: "❌ Lỗi khi phát âm thanh của dealer.", ephemeral: true }).catch(() => {});
        }
      }

      activeGames.delete(interaction.channelId);
    };

    const initialMessage = await interaction.editReply({
      content: `Bắt đầu Blackjack cho ${interaction.user.username} (Dealer: ${game.dealerStrategy.toUpperCase()})!\n\n` + game.getDisplay(true),
      components: [row],
    });

    if (game.status !== "playing") {
        await endGame(game, interaction);
        return;
    }

    const collector = initialMessage.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 120000,
    });

    collector.on("collect", async (buttonInteraction) => {
      await buttonInteraction.deferUpdate();
      const currentGame = activeGames.get(interaction.channelId);
      if (!currentGame) return;

      if (buttonInteraction.customId === "blackjack_hit") {
        currentGame.hitPlayer();
      } else if (buttonInteraction.customId === "blackjack_stand") {
        currentGame.standPlayer();
      }

      if (currentGame.status !== "playing") {
        await endGame(currentGame, buttonInteraction);
        collector.stop("game_ended");
      } else {
        await buttonInteraction.editReply({
          content: `Bắt đầu Blackjack cho ${interaction.user.username} (Dealer: ${currentGame.dealerStrategy.toUpperCase()})!\n\n` + currentGame.getDisplay(true),
          components: [row],
        });
      }
    });

    collector.on("end", async (collected, reason) => {
      const currentGame = activeGames.get(interaction.channelId);
      if (reason === "time" && currentGame) {
        currentGame.status = "dealer_win";
        await endGame(currentGame, interaction);
      }
    });
  },
};