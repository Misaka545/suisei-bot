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
async function getDanbooruImage(tags = '', rating = 'general', maxPage = 100) {
  const searchTags = `${tags} rating:${rating}`.trim();
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Use lower page range on later attempts if early attempts find nothing
      const currentMaxPage = attempt === 0 ? maxPage : Math.min(maxPage, 10);
      const randomPage = Math.floor(Math.random() * currentMaxPage) + 1;
      const params = {
        tags: searchTags,
        limit: 20,
        page: randomPage,
        ...getDanbooruAuth()
      };

      const res = await axios.get(`${DANBOORU_BASE}/posts.json`, { params, timeout: 10000 });
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
    const res = await axios.get(`https://nekos.best/api/v2/${category}`, { timeout: 10000 });
    const first = res.data.results && res.data.results[0];
    if (!first) return null; // Trả về null nếu API không tìm thấy kết quả
    return {
      url: first.url,
      anime: first.anime_name || 'Unknown'
    };
  } catch (error) {
    console.error(`Nekos.best API error for category '${category}':`, error.message);
    throw error; // Ném lỗi ra để lệnh có thể xử lý
  }
}

async function getMemeImage() {
  const res = await axios.get('https://meme-api.com/gimme', { timeout: 10000 });
  return {
    url: res.data.url,
    title: res.data.title,
    postLink: res.data.postLink,
    subreddit: res.data.subreddit
  };
}

// ============================================================
// Anime & Manga API (AniList GraphQL with Jikan Fallback)
// ============================================================

const ANILIST_BASE = 'https://graphql.anilist.co';
const JIKAN_BASE = 'https://api.jikan.moe/v4';

function cleanSynopsis(raw) {
  if (!raw) return 'No description available.';
  const cleaned = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .trim();
  return cleaned.length > 800 ? cleaned.substring(0, 800) + '...' : cleaned;
}

/**
 * Fetch random anime from AniList.
 * @returns {Promise<Object>}
 */
async function getRandomAnimeInfo() {
  // Try AniList GraphQL 
  try {
    const randomPage = Math.floor(Math.random() * 500) + 1;
    const query = `
      query ($page: Int) {
        Page(page: $page, perPage: 1) {
          media(type: ANIME, sort: SCORE_DESC) {
            id
            idMal
            title { romaji english native }
            description(asHtml: false)
            siteUrl
            coverImage { extraLarge large }
            format
            episodes
            status
            averageScore
            popularity
            genres
            season
            seasonYear
            studios(isMain: true) { nodes { name } }
            startDate { year month day }
            isAdult
          }
        }
      }
    `;

    const res = await axios.post(ANILIST_BASE, {
      query,
      variables: { page: randomPage }
    }, {
      timeout: 8000,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    });

    const anime = res.data?.data?.Page?.media?.[0];
    if (anime) {
      const year = anime.seasonYear || anime.startDate?.year || '';
      const airedStr = anime.startDate?.year
        ? `${anime.startDate.year}-${String(anime.startDate.month || 1).padStart(2, '0')}-${String(anime.startDate.day || 1).padStart(2, '0')}`
        : 'N/A';

      return {
        mal_id: anime.idMal || anime.id,
        title: anime.title?.romaji || anime.title?.english || anime.title?.native || 'Unknown',
        title_japanese: anime.title?.native || '',
        title_english: anime.title?.english || '',
        url: anime.idMal ? `https://myanimelist.net/anime/${anime.idMal}` : anime.siteUrl,
        image: anime.coverImage?.extraLarge || anime.coverImage?.large || null,
        synopsis: cleanSynopsis(anime.description),
        type: anime.format || 'N/A',
        episodes: anime.episodes || 'N/A',
        status: anime.status ? anime.status.replace(/_/g, ' ') : 'N/A',
        score: anime.averageScore ? (anime.averageScore / 10).toFixed(1) : 'N/A',
        rank: 'N/A',
        popularity: anime.popularity ? anime.popularity.toLocaleString() : 'N/A',
        genres: anime.genres?.join(', ') || 'N/A',
        studios: anime.studios?.nodes?.map(s => s.name).filter(Boolean).join(', ') || 'N/A',
        season: anime.season ? anime.season.toLowerCase() : '',
        year: year ? String(year) : '',
        rating: anime.isAdult ? 'R+ (18+)' : 'PG-13',
        aired: airedStr,
        source: 'AniList / MyAnimeList'
      };
    }
  } catch (aniErr) {
    console.warn('[Anime] AniList request failed, trying Jikan fallback:', aniErr.message);
  }

  // Fallback to Jikan API
  const res = await axios.get(`${JIKAN_BASE}/random/anime`, {
    timeout: 5000,
    headers: { 'User-Agent': 'SuiseiBot/1.0.0 (DiscordBot)' }
  });
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
    aired: anime.aired?.string || 'N/A',
    source: 'MyAnimeList'
  };
}

/**
 * Fetch random manga from AniList.
 * @returns {Promise<Object>}
 */
async function getRandomMangaInfo() {
  // Try AniList GraphQL
  try {
    const randomPage = Math.floor(Math.random() * 500) + 1;
    const query = `
      query ($page: Int) {
        Page(page: $page, perPage: 1) {
          media(type: MANGA, sort: SCORE_DESC) {
            id
            idMal
            title { romaji english native }
            description(asHtml: false)
            siteUrl
            coverImage { extraLarge large }
            format
            chapters
            volumes
            status
            averageScore
            popularity
            genres
            staff(sort: RELEVANCE) { nodes { name { full } } }
            startDate { year month day }
          }
        }
      }
    `;

    const res = await axios.post(ANILIST_BASE, {
      query,
      variables: { page: randomPage }
    }, {
      timeout: 8000,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    });

    const manga = res.data?.data?.Page?.media?.[0];
    if (manga) {
      const publishedStr = manga.startDate?.year
        ? `${manga.startDate.year}-${String(manga.startDate.month || 1).padStart(2, '0')}-${String(manga.startDate.day || 1).padStart(2, '0')}`
        : 'N/A';

      return {
        mal_id: manga.idMal || manga.id,
        title: manga.title?.romaji || manga.title?.english || manga.title?.native || 'Unknown',
        title_japanese: manga.title?.native || '',
        title_english: manga.title?.english || '',
        url: manga.idMal ? `https://myanimelist.net/manga/${manga.idMal}` : manga.siteUrl,
        image: manga.coverImage?.extraLarge || manga.coverImage?.large || null,
        synopsis: cleanSynopsis(manga.description),
        type: manga.format || 'N/A',
        chapters: manga.chapters || 'N/A',
        volumes: manga.volumes || 'N/A',
        status: manga.status ? manga.status.replace(/_/g, ' ') : 'N/A',
        score: manga.averageScore ? (manga.averageScore / 10).toFixed(1) : 'N/A',
        rank: 'N/A',
        popularity: manga.popularity ? manga.popularity.toLocaleString() : 'N/A',
        genres: manga.genres?.join(', ') || 'N/A',
        authors: manga.staff?.nodes?.map(a => a.name?.full).filter(Boolean).slice(0, 2).join(', ') || 'N/A',
        serializations: 'N/A',
        published: publishedStr,
        source: 'AniList / MyAnimeList'
      };
    }
  } catch (aniErr) {
    console.warn('[Manga] AniList request failed, trying Jikan fallback:', aniErr.message);
  }

  // Fallback to Jikan API
  const res = await axios.get(`${JIKAN_BASE}/random/manga`, {
    timeout: 5000,
    headers: { 'User-Agent': 'SuiseiBot/1.0.0 (DiscordBot)' }
  });
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
    published: manga.published?.string || 'N/A',
    source: 'MyAnimeList'
  };
}

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