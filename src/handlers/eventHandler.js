const ytdlp = require("yt-dlp-exec");

async function registerCoreEvents(client) {
  // warm up yt-dlp (không blocking nếu lỗi)
  (async () => {
    try {
      if (ytdlp.exec) await ytdlp.exec("--version");
      else await ytdlp("--version");
      console.log("yt-dlp ready");
    } catch (_) {}
  })();
}

module.exports = { registerCoreEvents };
