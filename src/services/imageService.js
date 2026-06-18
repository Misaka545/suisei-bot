// src/services/imageService.js
const axios = require('axios');

const DANBOORU_BASE = 'https://danbooru.donmai.us';

/**
 * Tạo auth params cho Danbooru nếu có credentials trong .env
 */
function getDanbooruAuth() {
  const login = process.env.DANBOORU_LOGIN;
  const apiKey = process.env.DANBOORU_API_KEY;
  if (login && apiKey) {
    return { login, api_key: apiKey };
  }
  return {};
}

/**
 * Lấy ảnh random từ Danbooru dựa trên tags và rating.
 * Dùng random page thay vì order:random để tránh database timeout.
 * @param {string} tags - Tags cách nhau bởi dấu cách (VD: '1girl cat_ears')
 * @param {string} rating - 'general' | 'sensitive' | 'questionable' | 'explicit'
 * @returns {Promise<{url: string, character: string, tags: string, source: string, id: number} | null>}
 */
async function getDanbooruImage(tags = '', rating = 'general', maxPage = 1000) {
  const searchTags = `${tags} rating:${rating}`.trim();
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Random page để tránh order:random timeout
      const randomPage = Math.floor(Math.random() * maxPage) + 1;
      const params = {
        tags: searchTags,
        limit: 20,
        page: randomPage,
        ...getDanbooruAuth()
      };

      const res = await axios.get(`${DANBOORU_BASE}/posts.json`, { params });
      const posts = res.data;

      if (!posts || posts.length === 0) continue; // Retry với page khác

      // Lọc posts có ảnh hợp lệ (chỉ lấy format Discord hỗ trợ: jpg, png, gif, webp)
      const discordFormats = /\.(jpg|jpeg|png|gif|webp)$/i;
      const validPosts = posts.filter(p => {
        const url = p.large_file_url || p.file_url;
        return url && discordFormats.test(url);
      });
      if (validPosts.length === 0) continue;

      // Chọn random từ kết quả
      const post = validPosts[Math.floor(Math.random() * validPosts.length)];

      return {
        url: post.large_file_url || post.file_url,
        character: post.tag_string_character || 'Original',
        tags: post.tag_string_general || '',
        source: post.source || `${DANBOORU_BASE}/posts/${post.id}`,
        id: post.id
      };
    } catch (error) {
      // Nếu 500/timeout, retry với page khác
      if (error.response?.status === 500 && attempt < MAX_RETRIES - 1) {
        console.warn(`[Danbooru] Retry ${attempt + 1}/${MAX_RETRIES} for tags: ${searchTags}`);
        continue;
      }
      throw error;
    }
  }

  return null;
}

/**
 * Lấy nhiều ảnh random từ Danbooru.
 * Gọi API nhiều lần vì order:random + limit>1 vẫn có thể trùng.
 * @param {string} tags
 * @param {string} rating
 * @param {number} count - Số ảnh cần lấy
 */
async function getDanbooruImages(tags = '', rating = 'general', count = 3, maxPage = 1000) {
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(getDanbooruImage(tags, rating, maxPage));
  }
  const results = await Promise.all(promises);
  return results.filter(r => r !== null);
}

async function getWaifuImage() {
  return getDanbooruImage('1girl', 'general');
}

async function getNekoImage() {
  return getDanbooruImage('cat_ears', 'general');
}

async function getHentaiImage(isGif = false) {
  // animated_gif có ít posts hơn → dùng page range nhỏ hơn
  const tags = isGif ? 'animated_gif' : '1girl';
  const maxPage = isGif ? 50 : 1000;
  return getDanbooruImage(tags, 'explicit', maxPage);
}

async function getHentaiImages(isGif = false, count = 3) {
  const tags = isGif ? 'animated_gif' : '1girl';
  const maxPage = isGif ? 50 : 1000;
  return getDanbooruImages(tags, 'explicit', count, maxPage);
}

async function getNSFWImage(isGif = false) {
  const tags = isGif ? 'animated_gif' : '1girl';
  const maxPage = isGif ? 50 : 1000;
  return getDanbooruImage(tags, 'explicit', maxPage);
}

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

async function getMemeImage() {
  const res = await axios.get('https://meme-api.com/gimme');
  return {
    url: res.data.url,
    title: res.data.title,
    postLink: res.data.postLink,
    subreddit: res.data.subreddit
  };
}

// ============================================================
// Jikan API (MyAnimeList) — Anime & Manga
// ============================================================

const JIKAN_BASE = 'https://api.jikan.moe/v4';

/**
 * Lấy thông tin random anime từ MyAnimeList qua Jikan API.
 * @returns {Promise<Object>} Thông tin anime
 */
async function getRandomAnimeInfo() {
  const res = await axios.get(`${JIKAN_BASE}/random/anime`);
  const anime = res.data.data;
  if (!anime) return null;

  return {
    mal_id: anime.mal_id,
    title: anime.title,
    title_japanese: anime.title_japanese || '',
    title_english: anime.title_english || '',
    url: anime.url,
    image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || null,
    synopsis: anime.synopsis ? (anime.synopsis.length > 800 ? anime.synopsis.substring(0, 800) + '...' : anime.synopsis) : 'No description available.',
    type: anime.type || 'N/A',
    episodes: anime.episodes || 'N/A',
    status: anime.status || 'N/A',
    score: anime.score || 'N/A',
    rank: anime.rank || 'N/A',
    popularity: anime.popularity || 'N/A',
    genres: anime.genres?.map(g => g.name).join(', ') || 'N/A',
    studios: anime.studios?.map(s => s.name).join(', ') || 'N/A',
    season: anime.season || '',
    year: anime.year || '',
    rating: anime.rating || 'N/A',
    aired: anime.aired?.string || 'N/A'
  };
}

/**
 * Lấy thông tin random manga từ MyAnimeList qua Jikan API.
 * @returns {Promise<Object>} Thông tin manga
 */
async function getRandomMangaInfo() {
  const res = await axios.get(`${JIKAN_BASE}/random/manga`);
  const manga = res.data.data;
  if (!manga) return null;

  return {
    mal_id: manga.mal_id,
    title: manga.title,
    title_japanese: manga.title_japanese || '',
    title_english: manga.title_english || '',
    url: manga.url,
    image: manga.images?.jpg?.large_image_url || manga.images?.jpg?.image_url || null,
    synopsis: manga.synopsis ? (manga.synopsis.length > 800 ? manga.synopsis.substring(0, 800) + '...' : manga.synopsis) : 'No description available.',
    type: manga.type || 'N/A',
    chapters: manga.chapters || 'N/A',
    volumes: manga.volumes || 'N/A',
    status: manga.status || 'N/A',
    score: manga.score || 'N/A',
    rank: manga.rank || 'N/A',
    popularity: manga.popularity || 'N/A',
    genres: manga.genres?.map(g => g.name).join(', ') || 'N/A',
    authors: manga.authors?.map(a => a.name).join(', ') || 'N/A',
    serializations: manga.serializations?.map(s => s.name).join(', ') || 'N/A',
    published: manga.published?.string || 'N/A'
  };
}

// Export tất cả các hàm
module.exports = {
  getDanbooruImage,
  getDanbooruImages,
  getWaifuImage,
  getNekoImage,
  getMemeImage,
  getNSFWImage,
  getHentaiImage,
  getHentaiImages,
  getGifImage,
  getRandomAnimeInfo,
  getRandomMangaInfo
};