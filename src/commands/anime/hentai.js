const { SlashCommandBuilder } = require("discord.js");
const { getHentaiImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hentai')
    .setDescription('Send a hentai image from Danbooru.'),
  async execute(interaction) {
    if (!interaction.channel || !interaction.channel.nsfw) {
      return interaction.reply({
        content: 'This command can only be used in an **NSFW channel**.',
        ephemeral: true
      });
    }

    try {
      await interaction.deferReply();

      const result = await getHentaiImage(false);

      if (!result) {
        return interaction.editReply(`No results found.`);
      }

      const characterName = result.character.replace(/_/g, ' ') || 'Original';

      await interaction.editReply({
        embeds: [
          {
            author: { name: 'NSFW Hentai' },
            title: `Hentai Image for you`,
            description: `**Character:** ${characterName}`,
            image: { url: result.url },
            color: 0xFF0000,
            footer: { text: `Source: Danbooru #${result.id} (NSFW)` },
            url: `https://danbooru.donmai.us/posts/${result.id}`
          }
        ]
      });
    } catch (err) {
      console.error('Error in /hentai command:', err);
      await interaction.editReply('An error occurred while calling the API. Please try again later.');
    }
  }
};