// src/services/imageService.js
const axios = require('axios');

// SFW functions remain the same
async function getAnimeImage() {
  const categories = ['waifu', 'neko', 'shinobu', 'megumin'];
  const randomCat = categories[Math.floor(Math.random() * categories.length)];
  const url = `https://api.waifu.pics/sfw/${randomCat}`;
  const res = await axios.get(url);
  return res.data.url;
}
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

// ==========================================================
// REVERTED SECTION FOR NSFW COMMANDS
// ==========================================================

async function getWaifuImResult(tag, isGif = false) {
  try {
    const res = await axios.get('https://api.waifu.im/search', {
      params: {
        included_tags: tag,
        is_nsfw: true,
        gif: isGif
      }
    });

    if (res.data.images && res.data.images.length > 0) {
      return res.data.images[0].url;
    }
    return null;

  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`Waifu.im API returned 404 for tag '${tag}' (isGif: ${isGif}).`);
      return null;
    }
    throw error;
  }
}

async function getNSFWImage(isGif = false) {
  return getWaifuImResult('waifu', isGif);
}
async function getYuriImage(isGif = false) {
  return getWaifuImResult('yuri', isGif);
}
async function getHentaiImage(isGif = false) {
  return getWaifuImResult('hentai', isGif);
}

// Export all functions
module.exports = {
  getAnimeImage,
  getWaifuImage,
  getNekoImage,
  getMemeImage,
  getNSFWImage,
  getYuriImage,
  getHentaiImage,
  getGifImage
};