const { PassThrough } = require("stream");
const { createAudioResource, StreamType } = require("@discordjs/voice");
// Thay đổi cách import
const YtDlpWrap = require("yt-dlp-exec");
const fs = require("fs");
const path = require("path");

// --- CẤU HÌNH ĐƯỜNG DẪN ---
const candidatePaths = [
  path.resolve(__dirname, '..', '..', 'bin', 'yt-dlp.exe'),
  'C:\\Python314\\Scripts\\yt-dlp.exe',
  path.resolve(__dirname, '..', '..', 'yt-dlp'),
];

let ytdlp = YtDlpWrap;
let usingLocal = 'Global/NPM';

for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    ytdlp = YtDlpWrap.create(p);
    usingLocal = p;
    break;
  }
}

console.log(`[yt-dlp] Using binary at: ${usingLocal}`);

const { execFile } = require("child_process");

let isUpdating = false;
function autoUpdateYtdlp() {
  if (isUpdating) return;
  isUpdating = true;

  const binary = usingLocal.endsWith(".exe") ? usingLocal : (process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  console.log(`[yt-dlp] Checking for updates using: ${binary}...`);

  execFile(binary, ["-U"], { windowsHide: true }, (err, stdout, stderr) => {
    isUpdating = false;
    if (err) {
      console.warn("[yt-dlp auto-update error]", err.message);
      return;
    }
    const msg = (stdout || stderr || "").trim().split("\n")[0];
    if (msg) console.log(`[yt-dlp auto-update] ${msg}`);
  });
}

// Run update check in background 5s after startup
setTimeout(autoUpdateYtdlp, 5000);

const PREFETCH_MS = 4000;
const PREFETCH_BYTES = 1 * 1024 * 1024;
const RESOURCE_HWM = 1 << 25;

function makeYtdlpResource(input) {
  // Cấu hình chung cho streaming YouTube
  const flags = {
    output: "-",
    quiet: true,
    format: "bestaudio[ext=webm][acodec=opus]/bestaudio/best",
    forceIpv4: true,
    retries: 5,
    fragmentRetries: 5,
    noWarnings: true,
    jsRuntimes: "node",
    remoteComponents: "ejs:github",
  };

  // Gọi process (hỗ trợ cả dạng exec function lẫn wrapped object)
  const proc = ytdlp.exec ? ytdlp.exec(input, flags) : ytdlp(input, flags);

  proc.on?.("error", (err) => {
    console.error("[yt-dlp process error]", err.message);
  });

  proc.stderr?.on("data", (d) => {
    const s = d.toString().trim();
    if (s && (s.includes('Error') || s.includes('WARNING'))) {
      console.log(`[yt-dlp] ${s}`);
      // Auto-update if yt-dlp reports outdated or 403 error
      if (s.includes('403') || s.includes('older than')) {
        autoUpdateYtdlp();
      }
    }
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

module.exports = { makeYtdlpResource, ytdlp, autoUpdateYtdlp };