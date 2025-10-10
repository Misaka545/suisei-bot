const { SlashCommandBuilder } = require("discord.js");
const { getWeatherData } = require("../../services/weatherService"); // We'll create this next
const { EPHEMERAL_FLAG } = require("../../utils/discordHelpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("weather")
    .setDescription("Get current weather for a specified location")
    .addStringOption((option) =>
      option
        .setName("location")
        .setDescription("City name, zip code, or coordinates (e.g., 'London', '90210', '34.05,-118.25')")
        .setRequired(false) // Make it optional if you want to support a default/saved location later
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false }); // Defer to allow time for API call

    const location = interaction.options.getString("location");

    if (!location) {
      return interaction.editReply({
        content: "❌ Please provide a location (e.g., city name, zip code). For example: `/weather London`",
        flags: EPHEMERAL_FLAG,
      });
    }

    try {
      const weatherData = await getWeatherData(location);

      if (!weatherData) {
        return interaction.editReply(`⚠️ Could not find weather for "${location}". Please check the spelling or try a different format.`);
      }

      const { name, country, main, weather, wind } = weatherData;
      const description = weather[0].description;
      const temperature = main.temp;
      const feelsLike = main.feels_like;
      const humidity = main.humidity;
      const windSpeed = wind.speed; // meters/second

      const replyContent = `
Current weather in **${name}, ${country}**:
Description: ${description} 
Temperature: **${temperature}°C** (feels like ${feelsLike}°C)
Humidity: ${humidity}%
Wind Speed: ${windSpeed} m/s
      `;

      return interaction.editReply(replyContent);
    } catch (error) {
      console.error("[Weather Command Error]", error);
      return interaction.editReply({
        content: `❌ An error occurred while fetching weather for "${location}". Please try again later.`,
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};