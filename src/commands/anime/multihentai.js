const { SlashCommandBuilder } = require("discord.js");
const { getHentaiImages } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('multihentai')
    .setDescription('Send 3 hentai images from Danbooru.'),
  async execute(interaction) {
    if (!interaction.channel || !interaction.channel.nsfw) {
      return interaction.reply({
        content: 'This command can only be used in an **NSFW channel**.',
        ephemeral: true
      });
    }

    try {
      await interaction.deferReply();

      const results = await getHentaiImages(false, 3);

      if (results.length === 0) {
        return interaction.editReply('No results found. The API may be experiencing issues.');
      }

      const embeds = results.map((result, i) => ({
        author: { name: `NSFW Hentai ${i+1}` },
        description: `**Character:** ${result.character.replace(/_/g, ' ') || 'Original'}`,
        image: { url: result.url },
        color: 0xFF0000,
        footer: { text: `Danbooru #${result.id}` },
        url: `https://danbooru.donmai.us/posts/${result.id}`
      }));

      await interaction.editReply({
        content: `${results.length} hentai results for you:`,
        embeds: embeds
      });

    } catch (err) {
      console.error('Error in /multihentai command:', err);
      await interaction.editReply('An error occurred while calling the API. Please try again later.');
    }
  }
};