const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require("discord.js");
const { BlackjackGame } = require("../../games/blackjackGame");
const { connectIfNeeded, music } = require("../../utils/musicState");
const { getVoiceConnection } = require("@discordjs/voice");
const { speakTextToChannel } = require("../../services/ttsService");

// A map to store active blackjack games by channel ID
const activeGames = new Map();

// VOICEVOX dialogue lines for blackjack outcomes
const bjDialogueLines = {
  dealer_win: [
    "また私の勝ちですね！心配しないで、いつかコツを掴めますよ…たぶん。",
    "ふふっ！カードは私の味方でした。戦略を変えてみたら？",
    "あらら、ハウスの勝ちですね！…今回は！",
    "残念でした！あなたのお金は私のものです。冗談ですよ…たぶん。",
    "次はきっと勝てますよ！私のカードが強すぎただけです。",
  ],
  player_win: [
    "ええっ、負けちゃった！ずるいよ！",
    "私のプログラムにはこのレベルの敗北は想定されていません…。",
    "そんな…こんなはずじゃ！私の連勝記録が…。",
    "あら、計算を間違えたみたい。おめでとう…ございます。",
    "カードが…裏切りました！",
    "今回は運が良かったですね！次は負けませんよ、覚えておいて！",
  ],
  push: [
    "引き分け！これは…予想外でしたね。また遊びましょう！",
    "引き分けですか！面白いですね。確率がぴったり揃いました。",
    "うーん、プッシュですね。今日のカードは本当にバランスが良い。",
    "どちらも勝ちでも負けでもない。見方次第ですけどね。",
    "誰も勝たず、誰も負けず。公平な結果ですね。",
  ],
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
        content: "A Blackjack game is already in progress in this channel. Finish that game first!",
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
      const finalDisplayContent = `Blackjack game for ${currentInteraction.user.username} has ended!\n\n` + finalGame.getDisplay(false);

      await currentInteraction.editReply({
          content: finalDisplayContent,
          components: [row]
      }).catch(console.error);

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const voiceChannel = member?.voice?.channel;

      if (voiceChannel) {
        try {
          const lines = bjDialogueLines[finalGame.status];
          if (lines && lines.length > 0) {
            const randomLine = lines[Math.floor(Math.random() * lines.length)];
            console.log(`[Blackjack TTS] Playing dialogue for: ${finalGame.status}`);
            await speakTextToChannel(voiceChannel, randomLine, interaction.guildId);
          }
        } catch (audioError) {
          if (audioError.code !== 'ABORT_ERR' && audioError.name !== 'AbortError') {
            console.error("[Blackjack TTS] Error:", audioError);
          }
        }
      }

      activeGames.delete(interaction.channelId);
    };

    const initialMessage = await interaction.editReply({
      content: `Starting Blackjack for ${interaction.user.username} (Dealer: ${game.dealerStrategy.toUpperCase()})!\n\n` + game.getDisplay(true),
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
          content: `Starting Blackjack for ${interaction.user.username} (Dealer: ${currentGame.dealerStrategy.toUpperCase()})!\n\n` + currentGame.getDisplay(true),
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