const { SlashCommandBuilder } = require("discord.js");
const { getNekoImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('neko')
    .setDescription('Send a random neko (cat ears) image (SFW) from Danbooru.'),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const result = await getNekoImage();

      if (!result) {
        return interaction.editReply('No image found. Please try again!');
      }

      const characterName = result.character.replace(/_/g, ' ') || 'Original';

      await interaction.editReply({
        embeds: [
          {
            author: { name: 'Random Neko' },
            description: `**Character:** ${characterName}`,
            image: { url: result.url },
            color: 0xFFB6C1,
            footer: { text: `Source: Danbooru #${result.id}` },
            url: `https://danbooru.donmai.us/posts/${result.id}`
          }
        ]
      });
    } catch (err) {
      console.error('Error in /neko command:', err);
      await interaction.editReply('An error occurred while calling the API. Please try again later.');
    }
  }
};