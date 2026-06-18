const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getRandomMangaInfo } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manga')
    .setDescription('Get a random manga from MyAnimeList with detailed info.'),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const manga = await getRandomMangaInfo();

      if (!manga) {
        return interaction.editReply('Could not fetch manga info. Please try again!');
      }

      // Tạo title hiển thị
      let title = manga.title;
      if (manga.title_english && manga.title_english !== manga.title) {
        title = `${manga.title_english} (${manga.title})`;
      }

      // Tạo subtitle với title tiếng Nhật nếu khác
      const japaneseTitle = manga.title_japanese ? `🇯🇵 ${manga.title_japanese}` : '';

      const embed = new EmbedBuilder()
        .setAuthor({ name: 'Random Manga' })
        .setTitle(title)
        .setURL(manga.url)
        .setColor(0x2E51A2) // Màu xanh MyAnimeList
        .setDescription(
          (japaneseTitle ? japaneseTitle + '\n\n' : '') +
          `**Synopsis:**\n${manga.synopsis}`
        )
        .addFields(
          { name: '📚 Type', value: manga.type, inline: true },
          { name: '📄 Chapters', value: `${manga.chapters}`, inline: true },
          { name: '📕 Volumes', value: `${manga.volumes}`, inline: true },
          { name: '📡 Status', value: manga.status, inline: true },
          { name: '⭐ Score', value: `${manga.score}`, inline: true },
          { name: '🏆 Rank', value: `#${manga.rank}`, inline: true },
          { name: '🔥 Popularity', value: `#${manga.popularity}`, inline: true },
          { name: '🎭 Genres', value: manga.genres, inline: true },
          { name: '✍️ Authors', value: manga.authors, inline: true },
          { name: '📰 Serialization', value: manga.serializations, inline: true },
          { name: '📅 Published', value: manga.published, inline: true }
        )
        .setFooter({ text: 'Source: MyAnimeList' });

      if (manga.image) {
        embed.setThumbnail(manga.image);
      }

      await interaction.editReply({
        embeds: [embed]
      });
    } catch (err) {
      console.error('Error in /manga command:', err);
      await interaction.editReply('An error occurred while calling the API. Please try again later.');
    }
  }
};
