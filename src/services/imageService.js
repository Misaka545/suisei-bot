// src/services/imageService.js
const axios = require('axios');

// Các hàm SFW khác giữ nguyên
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

// HÀM ĐƯỢC NÂNG CẤP
/**
 * Lấy ảnh hoặc GIF từ API nekos.best dựa trên một danh mục cụ thể.
 * @param {string} category - Tên của danh mục (ví dụ: 'hug', 'pat', 'waifu').
 */
async function getGifImage(category) {
  try {
    const res = await axios.get(`https://nekos.best/api/v2/${category}`);
    const first = res.data.results && res.data.results[0];
    if (!first) return null; // Trả về null nếu API không tìm thấy kết quả
    return {
      url: first.url,
      anime: first.anime_name || 'Unknown'
    };
  } catch (error) {
    console.error(`Lỗi API Nekos.best cho danh mục '${category}':`, error.message);
    throw error; // Ném lỗi ra để lệnh có thể xử lý
  }
}

// Các hàm NSFW giữ nguyên
async function getWaifuImResult(tag, isGif = false) {
  try {
    const res = await axios.get('https://api.waifu.im/search', {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.5",
      },
      params: { included_tags: tag, is_nsfw: true, gif: isGif }
    });
    return res.data.images && res.data.images.length > 0 ? res.data.images[0].url : null;
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

// Export tất cả các hàm
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