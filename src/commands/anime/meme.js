const { SlashCommandBuilder } = require("discord.js");
const { getMemeImage } = require("../../services/imageService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Send a random meme image.'),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const meme = await getMemeImage();

      await interaction.editReply({
        embeds: [
          {
            author: { name: 'Random Meme' },
            title: meme.title,
            url: meme.postLink,
            image: { url: meme.url },
            footer: { text: `Subreddit: ${meme.subreddit}` }
          }
        ]
      });
    } catch (err) {
      console.error('Error in /meme command:', err);
      await interaction.editReply('An error occurred while calling the API. Please try again later.');
    }
  }
};