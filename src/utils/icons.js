const ICONS = {
    // Dynamic bot avatar
    botAvatar: (client) => client?.user?.displayAvatarURL({ extension: 'png', size: 1024 }) || null,
    
    // Twemoji icons (hosted on CDNJS)
    success: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2705.png', // White heavy check mark
    error: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/274c.png',   // Cross mark
    info: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2139.png',    // Information source
    warning: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/26a0.png', // Warning
    nsfw: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f51e.png',   // 18+
    game: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3b0.png',   // Slot machine
    anime: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3a8.png',  // Palette
    music: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3b5.png'   // Musical note
};

module.exports = { ICONS };
