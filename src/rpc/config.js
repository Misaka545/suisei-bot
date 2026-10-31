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
    {
      details: "ビビデバ (Bibbidiba)",
      state: "Bibbidi bobbidi boowa",
      largeImageKey: "https://static.wikia.nocookie.net/jpop/images/5/53/Bibbidiba_Limited.jpg/revision/latest?cb=20240626160809",
      largeImageText: "ビビデバ - Hoshimachi Suisei",
    },
    {
      details: "Stellar Stellar",
      state: "だって僕は星だから stellar, stellar",
      largeImageKey: "https://hololive.hololivepro.com/wp-content/uploads/2021/09/%E6%98%9F%E8%A1%97%E3%81%99%E3%81%84%E3%81%9B%E3%81%84_Still-Still-Stellar_jk-1536x1536.png",
      largeImageText: "Still Still Stellar - Hoshimachi Suisei",
    },
    {
      details: "GHOST",
      state: "じゃあ、君の夜を奪おうか",
      largeImageKey: "https://hololive.hololivepro.com/wp-content/uploads/2021/04/GHOST_samune-e1661929834875.png",
      largeImageText: "GHOST - Hoshimachi Suisei",
    },
    {
      details: "GUM&DROP",
      state: "Chewy little gummy, gummy, cutie, yummy, yummy",
      largeImageKey: "https://images.genius.com/5752c6c5fdfd25cedb11b4ea8dfe86c6.1000x1000x1.png",
      largeImageText: "GUM&DROP - Hoshimachi Suisei",
    },
    // {
    //   details: "ソワレ (soirée)",
    //   state: "Step by step! 踊り明かそう",
    //   largeImageKey: "https://media.tenor.com/CiomSOawfRUAAAAM/hoshimachi-suisei-suisei.gif",
    //   largeImageText: "Specter - Hoshimachi Suisei",
    // },
  ],
};
