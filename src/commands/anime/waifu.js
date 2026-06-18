const { SlashCommandBuilder } = require("discord.js");
const { getWaifuImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('waifu')
    .setDescription('Send a random waifu image (SFW) from Danbooru.'),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const result = await getWaifuImage();

      if (!result) {
        return interaction.editReply('No image found. Please try again!');
      }

      const characterName = result.character.replace(/_/g, ' ') || 'Original';

      await interaction.editReply({
        embeds: [
          {
            author: { name: 'Random Waifu' },
            description: `**Character:** ${characterName}`,
            image: { url: result.url },
            color: 0xFF69B4,
            footer: { text: `Source: Danbooru #${result.id}` },
            url: `https://danbooru.donmai.us/posts/${result.id}`
          }
        ]
      });
    } catch (err) {
      console.error('Error in /waifu command:', err);
      await interaction.editReply('An error occurred while calling the API. Please try again later.');
    }
  }
};