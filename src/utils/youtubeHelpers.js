const { PassThrough } = require("stream");
const { createAudioResource, StreamType } = require("@discordjs/voice");
// Thay đổi cách import
const YtDlpWrap = require("yt-dlp-exec"); 
const fs = require("fs");
const path = require("path");

// --- CẤU HÌNH ĐƯỜNG DẪN ---
// Tìm file yt-dlp.exe trong thư mục bin (cách thư mục utils 2 cấp)
const localBinPath = path.resolve(__dirname, '..', '..', 'bin', 'yt-dlp.exe');

// Xác định trình thực thi: Nếu có file local thì dùng, không thì dùng mặc định của npm
const ytdlp = fs.existsSync(localBinPath) 
    ? YtDlpWrap.create(localBinPath) 
    : YtDlpWrap;

console.log(`[yt-dlp] Using binary at: ${fs.existsSync(localBinPath) ? localBinPath : 'Global/NPM'}`);

const YTDLP_HEADERS = ["User-Agent: Mozilla/5.0", "Accept-Language: en-US,en;q=0.9"];
const YTDLP_RATE = "2M";
const PREFETCH_MS = 6000;
const PREFETCH_BYTES = 2* 1024 * 1024;
const RESOURCE_HWM = 1 << 25;

function makeYtdlpResource(input) {
  // Cấu hình chung
  const flags = {
    output: "-",
    quiet: true,
    format: "bestaudio[ext=webm][acodec=opus]/bestaudio/best",
    addHeader: YTDLP_HEADERS,
    httpChunkSize: "10M", // Sửa lại cú pháp camelCase cho yt-dlp-exec object
    forceIpv4: true,
    limitRate: YTDLP_RATE,
    retries: 3,
    fragmentRetries: 3,
  };

  // Gọi process (hỗ trợ cả dạng exec function lẫn wrapped object)
  const proc = ytdlp.exec ? ytdlp.exec(input, flags) : ytdlp(input, flags);

  proc.stderr?.on("data", (d) => {
    const s = d.toString().trim();
    // Lọc bớt log rác, chỉ hiện lỗi quan trọng
    if (s && (s.includes('Error') || s.includes('WARNING'))) console.log(`[yt-dlp] ${s}`);
  });

  const out = proc.stdout;
  const pt = new PassThrough({ highWaterMark: RESOURCE_HWM });
  let preBytes = 0, prebuffering = true;

  function onData(chunk) {
    if (!prebuffering) return;
    preBytes += chunk.length;
    pt.write(chunk);
    if (preBytes >= PREFETCH_BYTES) {
      prebuffering = false;
      out.off("data", onData);
      out.pipe(pt, { end: true });
    }
  }

  out.on("error", (e) => {
      // Xử lý lỗi pipe vỡ (thường xảy ra khi skip bài) để không crash bot
      if (e.code !== 'ERR_STREAM_DESTROYED') console.error('[yt-dlp stream error]', e.message);
      pt.destroy(e);
  });
  
  out.on("end", () => pt.end());
  out.on("data", onData);

  setTimeout(() => {
    if (prebuffering) {
      prebuffering = false;
      out.off("data", onData);
      out.pipe(pt, { end: true });
    }
  }, PREFETCH_MS);

  const resource = createAudioResource(pt, {
    inputType: StreamType.WebmOpus,
    inlineVolume: false,
    highWaterMark: RESOURCE_HWM,
    metadata: {},
  });

  return { proc, resource };
}

module.exports = { makeYtdlpResource };