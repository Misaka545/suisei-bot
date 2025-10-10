const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require("discord.js");
const { BlackjackGame } = require("../../games/blackjackGame");
const { speakTextToChannel } = require("../../services/ttsService");
const { connectIfNeeded } = require("../../utils/musicState");

// A map to store active blackjack games by channel ID
const activeGames = new Map();

// Teasing phrases for the dealer (when winning)
const dealerTeasePhrases = [
  "Better luck next time, human! My cards were just too good.",
  "Oops, looks like the house always wins... this time!",
  "Another one for the dealer! Don't worry, you'll get the hang of it... eventually.",
  "Hee hee! The cards favored me again. Maybe try a different strategy?",
  "Such a shame! Your money is mine now. Just kidding... mostly.",
];

// Sad/crying phrases for the dealer (when losing)
const dealerSadPhrases = [
  "No... not like this! My perfect streak is broken... *sniff*",
  "Aww, I lost? That's not fair!",
  "The cards... they betrayed me!",
  "You got lucky this time! I'll get you next round, just you wait... *muttering*",
  "My programming does not account for this level of defeat...",
  "Oh dear, I seem to have miscalculated. Congratulations, I suppose. *sigh*",
];

// Neutral/draw phrases for the dealer (when pushing)
const dealerDrawPhrases = [
  "A draw? Well, that was... unexpected. Let's play again soon!",
  "Hmm, a push. The cards are truly balanced today.",
  "Neither of us won, neither of us lost. A fair outcome, I suppose.",
  "A tie! Interesting. The odds were perfectly even.",
  "Looks like we're both winners, or both not winners. Depending on how you look at it.",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Start a game of Blackjack!")
    .addStringOption((option) =>
      option
        .setName("difficulty")
        .setDescription("Choose dealer's difficulty")
        .setRequired(false) // Make it optional, default to random if not chosen
        .addChoices(
          { name: "Easy (Dealer stands on 17)", value: "easy" },
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

    // Defer the initial reply IMMEDIATELY to prevent interaction token expiry.
    await interaction.deferReply({ ephemeral: false });

    // Get the chosen difficulty, or null if not provided
    const chosenDifficulty = interaction.options.getString("difficulty");

    // Pass the chosen difficulty to the BlackjackGame constructor
    const game = new BlackjackGame(interaction.user.id, interaction.user.username, chosenDifficulty);
    activeGames.set(interaction.channelId, game);

    game.start();

    const hitButton = new ButtonBuilder()
      .setCustomId("blackjack_hit")
      .setLabel("Hit")
      .setStyle(ButtonStyle.Primary);

    const standButton = new ButtonBuilder()
      .setCustomId("blackjack_stand")
      .setLabel("Stand")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(hitButton, standButton);

    // Function to handle ending the game, including TTS teasing/sadness
    const endGame = async (finalGame, currentInteraction, reason = "game_ended") => {
      // Ensure buttons are disabled for the final message
      row.components.forEach(c => c.setDisabled(true));
      const finalDisplayContent = `Trò chơi Blackjack cho ${currentInteraction.user.username} đã kết thúc!\n\n` + finalGame.getDisplay(false);

      if (currentInteraction.isChatInputCommand()) {
        await currentInteraction.editReply({
            content: finalDisplayContent,
            components: [row]
        }).catch(console.error);
      } else if (currentInteraction.isMessageComponent()) {
        await currentInteraction.editReply({
            content: finalDisplayContent,
            components: [row]
        }).catch(console.error);
      } else {
         await interaction.followUp({
             content: finalDisplayContent,
             components: [row]
         }).catch(console.error);
      }

      // Voice TTS Logic (Teasing or Sadness)
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const voiceChannel = member?.voice?.channel;

      if (voiceChannel) {
        try {
          await connectIfNeeded(interaction, voiceChannel, { selfDeaf: false, selfMute: false });
          console.log("[Blackjack TTS] Bot connected to voice channel.");

          const me = voiceChannel.guild.members.me;
          try {
            if (me?.voice?.selfDeaf) await me.voice.setSelfDeaf(false);
            if (me?.voice?.selfMute) await me.voice.setSelfMute(false);
            if (me?.voice?.serverDeaf) await me.voice.setDeaf(false);
            if (me?.voice?.serverMute) await me.voice.setMute(false);
            if (voiceChannel.type === ChannelType.GuildStageVoice && me.voice.suppress) {
              await me.voice.setSuppressed(false);
            }
          } catch (e) {
            console.warn("[Blackjack] cannot clear deaf/mute/suppress:", e?.message || e);
          }

          let ttsMessage = "";
          if (finalGame.status === "dealer_win") {
            ttsMessage = dealerTeasePhrases[Math.floor(Math.random() * dealerTeasePhrases.length)];
          } else if (finalGame.status === "player_win") {
            ttsMessage = dealerSadPhrases[Math.floor(Math.random() * dealerSadPhrases.length)];
          } else if (finalGame.status === "push") { 
            ttsMessage = dealerDrawPhrases[Math.floor(Math.random() * dealerDrawPhrases.length)];
          }

          if (ttsMessage) {
              await speakTextToChannel(voiceChannel, ttsMessage);
          }
        } catch (ttsError) {
          console.error("[Blackjack] TTS error:", ttsError);
          if (currentInteraction.isMessageComponent()) {
             await interaction.followUp({ content: "❌ Lỗi khi phát giọng nói của dealer.", ephemeral: true }).catch(() => {});
          } else {
             await currentInteraction.followUp({ content: "❌ Lỗi khi phát giọng nói của dealer.", ephemeral: true }).catch(() => {});
          }
        }
      }

      activeGames.delete(interaction.channelId);
    };

    // Now, after deferring, we can safely edit the reply
    const initialMessage = await interaction.editReply({
      content: `Bắt đầu Blackjack cho ${interaction.user.username} (Dealer: ${game.dealerStrategy.toUpperCase()})!\n\n` + game.getDisplay(true),
      components: [row],
    });

    // Check for immediate win/loss/push at start
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

      if (!activeGames.has(interaction.channelId)) {
          return buttonInteraction.editReply({
            content: "Trò chơi Blackjack đã kết thúc hoặc không còn hoạt động.",
            components: []
          });
      }
      const currentGame = activeGames.get(interaction.channelId);

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
      if (reason === "time") {
        const currentGame = activeGames.get(interaction.channelId);
        if (currentGame) {
            currentGame.status = "dealer_win"; // Default to dealer win on timeout
            await endGame(currentGame, interaction, "time_expired");
        }
      }
    });
  },
};