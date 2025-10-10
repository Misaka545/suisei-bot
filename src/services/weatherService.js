// src/services/weatherService.js
const fetch = global.fetch || ((...a)=>import('node-fetch').then(({default:f})=>f(...a)));

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY; // You'll need to add this to your .env

async function getWeatherData(location) {
  if (!OPENWEATHER_API_KEY) {
    console.error("❌ Missing OPENWEATHER_API_KEY in .env");
    throw new Error("Weather service is not configured. Please set OPENWEATHER_API_KEY.");
  }

  // Determine if location is coordinates (e.g., "34.05,-118.25")
  const coordsMatch = location.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  let url;

  if (coordsMatch) {
    const lat = coordsMatch[1];
    const lon = coordsMatch[2];
    url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
  } else {
    // Assume it's a city name or zip code for now
    url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${OPENWEATHER_API_KEY}&units=metric`;
  }

  try {
    const res = await (await fetch)(url);
    const data = await res.json();

    if (res.status !== 200) {
      console.error(`[Weather API Error] Status: ${res.status}, Message: ${data.message}`);
      return null; // Return null for "city not found" or other API errors
    }
    return data;
  } catch (error) {
    console.error("[WeatherService] Error fetching weather data:", error);
    throw error;
  }
}

module.exports = { getWeatherData };