const { PassThrough } = require("stream");
const { createAudioResource, StreamType } = require("@discordjs/voice");
const ytdlp = require("yt-dlp-exec");

const YTDLP_HEADERS = ["User-Agent: Mozilla/5.0", "Accept-Language: en-US,en;q=0.9"];
const YTDLP_RATE = "2M";
const PREFETCH_MS = 6000;
const PREFETCH_BYTES = 2* 1024 * 1024;
const RESOURCE_HWM = 1 << 25;

function makeYtdlpResource(input) {
  const proc = ytdlp.exec
    ? ytdlp.exec(input, {
        output: "-",
        quiet: true,
        format: "bestaudio[ext=webm][acodec=opus]/bestaudio/best",
        addHeader: YTDLP_HEADERS,
        "http-chunk-size": "10M",
        "force-ipv4": true,
        limitRate: YTDLP_RATE,
        retries: 3,
        "fragment-retries": 3,
      })
    : ytdlp(input, {
        output: "-",
        quiet: true,
        format: "bestaudio[ext=webm][acodec=opus]/bestaudio/best",
        addHeader: YTDLP_HEADERS,
        "http-chunk-size": "10M",
        "force-ipv4": true,
        limitRate: YTDLP_RATE,
        retries: 3,
        "fragment-retries": 3,
      });

  proc.stderr?.on("data", (d) => {
    const s = d.toString().trim();
    if (s) console.log(`[yt-dlp] ${s}`);
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

  out.on("error", (e) => pt.destroy(e));
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
