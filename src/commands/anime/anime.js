const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getRandomAnimeInfo } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anime')
    .setDescription('Get a random anime from MyAnimeList with detailed info.'),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const anime = await getRandomAnimeInfo();

      if (!anime) {
        return interaction.editReply('Could not fetch anime info. Please try again!');
      }

      // Tạo title hiển thị
      let title = anime.title;
      if (anime.title_english && anime.title_english !== anime.title) {
        title = `${anime.title_english} (${anime.title})`;
      }

      // Tạo subtitle với title tiếng Nhật nếu khác
      const japaneseTitle = anime.title_japanese ? `🇯🇵 ${anime.title_japanese}` : '';

      // Season + Year
      const seasonYear = anime.season && anime.year
        ? `${anime.season.charAt(0).toUpperCase() + anime.season.slice(1)} ${anime.year}`
        : anime.year || '';

      const embed = new EmbedBuilder()
        .setAuthor({ name: 'Random Anime' })
        .setTitle(title)
        .setURL(anime.url)
        .setColor(0x2E51A2)
        .setDescription(
          (japaneseTitle ? japaneseTitle + '\n\n' : '') +
          `**Synopsis:**\n${anime.synopsis}`
        )
        .addFields(
          { name: '📺 Type', value: anime.type, inline: true },
          { name: '🎬 Episodes', value: `${anime.episodes}`, inline: true },
          { name: '📡 Status', value: anime.status, inline: true },
          { name: '⭐ Score', value: `${anime.score}`, inline: true },
          { name: '🏆 Rank', value: `#${anime.rank}`, inline: true },
          { name: '🔥 Popularity', value: `#${anime.popularity}`, inline: true },
          { name: '🎭 Genres', value: anime.genres, inline: true },
          { name: '🏢 Studio', value: anime.studios, inline: true },
          { name: '📅 Aired', value: anime.aired, inline: true }
        )
        .setFooter({ text: `Source: MyAnimeList • ${anime.rating}${seasonYear ? ' • ' + seasonYear : ''}` });

      if (anime.image) {
        embed.setThumbnail(anime.image);
      }

      await interaction.editReply({
        embeds: [embed]
      });
    } catch (err) {
      console.error('Error in /anime command:', err);
      await interaction.editReply('An error occurred while calling the API. Please try again later.');
    }
  }
};