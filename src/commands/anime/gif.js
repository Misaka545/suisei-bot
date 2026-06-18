const { SlashCommandBuilder } = require("discord.js");
const { getGifImage } = require("../../services/imageService");

const categoryChoices = [
    { name: 'hug', value: 'hug' },
    { name: 'pat', value: 'pat' },
    { name: 'kiss', value: 'kiss' },
    { name: 'slap', value: 'slap' },
    { name: 'punch', value: 'punch' },
    { name: 'cry', value: 'cry' },
    { name: 'laugh', value: 'laugh' },
    { name: 'smile', value: 'smile' },
    { name: 'blush', value: 'blush' },
    { name: 'wave', value: 'wave' },
    { name: 'highfive', value: 'highfive' },
    { name: 'handhold', value: 'handhold' },
    { name: 'poke', value: 'poke' },
    { name: 'cuddle', value: 'cuddle' },
    { name: 'kick', value: 'kick' },
    { name: 'bite', value: 'bite' },
    { name: 'feed', value: 'feed' },
    { name: 'dance', value: 'dance' },
    { name: 'happy', value: 'happy' },
    { name: 'angry', value: 'angry' },
    { name: 'bored', value: 'bored' },
    { name: 'facepalm', value: 'facepalm' },
    { name: 'sleep', value: 'sleep' },
    { name: 'waifu', value: 'waifu' },
    { name: 'neko', value: 'neko' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gif')
    .setDescription('Send an anime GIF/image based on the selected category.')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Choose a category from the list')
        .setRequired(true)
        .addChoices(...categoryChoices) // Thêm 25 lựa chọn vào lệnh
    ),
  async execute(interaction) {
    try {
      await interaction.deferReply();
      
      const category = interaction.options.getString('category');
      const result = await getGifImage(category);

      if (!result) {
        return interaction.editReply(`No results found for category '${category}'.`);
      }

      await interaction.editReply({
        embeds: [
          {
            author: { name: `Anime GIF: ${category}` },
            image: { url: result.url },
            footer: { text: `Source: nekos.best - Anime: ${result.anime}` }
          }
        ]
      });
    } catch (err) {
      console.error('Error in /gif command:', err);
      await interaction.editReply('A critical error occurred while calling the API. Please try again later.');
    }
  }
};