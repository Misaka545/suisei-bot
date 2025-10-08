const https = require("https");
const { URL } = require("url");

function httpsJson(fullUrl, headers = {}, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const opts = { hostname: u.hostname, path: u.pathname + (u.search || ""), port: 443, method, headers };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
        } else reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getSpotifyToken() {
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing SPOTIFY_CLIENT_ID/SECRET in .env");
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const form = "grant_type=client_credentials";
  const json = await httpsJson("https://accounts.spotify.com/api/token",
    {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(form),
    },
    "POST",
    form
  );
  if (!json?.access_token) throw new Error("Could not obtain Spotify access token");
  return json.access_token;
}

async function spotifyApiGet(url, token) {
  return httpsJson(url, { Authorization: `Bearer ${token}` });
}

module.exports = { httpsJson, getSpotifyToken, spotifyApiGet };
