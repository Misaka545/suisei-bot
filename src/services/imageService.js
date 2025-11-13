// src/services/imageService.js
const axios = require('axios');

// This function remains the same
async function getAnimeImage() {
  const categories = ['waifu'];
  const randomCat = categories[Math.floor(Math.random() * categories.length)];
  const url = `https://api.waifu.pics/sfw/${randomCat}`;
  const res = await axios.get(url);
  return res.data.url;
}

// These SFW functions remain the same
async function getWaifuImage() {
  const res = await axios.get('https://api.waifu.pics/sfw/waifu');
  return res.data.url;
}
async function getNekoImage() {
  const res = await axios.get('https://api.waifu.pics/sfw/neko');
  return res.data.url;
}
async function getMemeImage() {
  const res = await axios.get('https://meme-api.com/gimme');
  return {
    url: res.data.url,
    title: res.data.title,
    postLink: res.data.postLink,
    subreddit: res.data.subreddit
  };
}
async function getGifImage() {
  const res = await axios.get('https://nekos.best/api/v2/hug');
  const first = res.data.results && res.data.results[0];
  if (!first) throw new Error('No GIF found');
  return {
    url: first.url,
    anime: first.anime_name || 'Unknown'
  };
}

/**
 * A robust, reusable function to call the waifu.im API.
 * @param {string} tag - The tag to search for (e.g., 'waifu', 'hentai').
 * @param {boolean} isGif - Whether to search for a GIF instead of a static image.
 */
async function getWaifuImResult(tag, isGif = false) {
  try {
    const res = await axios.get('https://api.waifu.im/search', {
      params: {
        included_tags: tag,
        is_nsfw: true,
        gif: isGif // The API parameter to request a GIF
      }
    });

    if (res.data.images && res.data.images.length > 0) {
      return res.data.images[0].url;
    }
    return null; // No results found

  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`Waifu.im API returned 404 for tag '${tag}' (isGif: ${isGif}).`);
      return null;
    }
    throw error; // Re-throw other errors
  }
}

// UPDATED: This function now uses the new, more powerful getWaifuImResult
async function getNSFWImage(isGif = false) {
  return getWaifuImResult('waifu', isGif);
}

// UPDATED: This function now accepts the isGif parameter
async function getYuriImage(isGif = false) {
  return getWaifuImResult('yuri', isGif);
}

// UPDATED: This function now accepts the isGif parameter
async function getHentaiImage(isGif = false) {
  return getWaifuImResult('hentai', isGif);
}


// Export all functions
module.exports = {
  getAnimeImage,
  getWaifuImage,
  getNekoImage,
  getMemeImage,
  getNSFWImage, // This is now the updated function
  getYuriImage,
  getHentaiImage,
  getGifImage
};