require("dotenv").config();

module.exports = {
  clientId: process.env.CLIENT_ID,
  mode: "rotate",
  rotationIntervalMinutes: 5,
  timeMode: "local",
  buttons: [
    {
      label: "YouTube",
      url: "https://www.youtube.com/@HoshimachiSuisei",
    },
    {
      label: "Spotify",
      url: "https://open.spotify.com/intl-vi/artist/726WiFmWkohzodUxK3XjHX",
    },
  ],
  tracks: [
    {
      details: "Sui-chan .✦˖",
      state: "すいちゃんは今日もかわいい！",
      largeImageKey: "https://media1.tenor.com/m/IeilB8ZBgjAAAAAd/suisei.gif",
      largeImageText: "Hoshimachi Suisei",
    },
    // {
    //   details: "ビビデバ (Bibbidiba)",
    //   state: "Bibbidi bobbidi boowa",
    //   largeImageKey: "https://media.tenor.com/p5_6CnD0D9sAAAAM/suisei-%E6%98%9F%E8%A1%97%E3%81%99%E3%81%84%E3%81%9B%E3%81%84.gif",
    //   largeImageText: "ビビデバ - Hoshimachi Suisei",
    // },
    // {
    //   details: "Stellar Stellar",
    //   state: "そう ずっと ずっと 待ってたんだ",
    //   largeImageKey: "https://media.tenor.com/CiomSOawfRUAAAAM/hoshimachi-suisei-suisei.gif",
    //   largeImageText: "Still Still Stellar - Hoshimachi Suisei",
    // },
    // {
    //   details: "GHOST",
    //   state: "じゃあ、君の夜を奪おうか",
    //   largeImageKey: "https://media.tenor.com/Rdtg_oNFDUUAAAAM/suisei-hoshimachi.gif",
    //   largeImageText: "GHOST - Hoshimachi Suisei",
    // },
    // {
    //   details: "みちづれ (Michizure)",
    //   state: "街をゆく 彗星の影",
    //   largeImageKey: "https://media.tenor.com/gv2DQ_LGIZMAAAAM/suisei-%E6%98%9F%E8%A1%97%E3%81%99%E3%81%84%E3%81%9B%E3%81%84.gif",
    //   largeImageText: "Specter - Hoshimachi Suisei",
    // },
    // {
    //   details: "ソワレ (soirée)",
    //   state: "Step by step! 踊り明かそう",
    //   largeImageKey: "https://media.tenor.com/CiomSOawfRUAAAAM/hoshimachi-suisei-suisei.gif",
    //   largeImageText: "Specter - Hoshimachi Suisei",
    // },
  ],
};
