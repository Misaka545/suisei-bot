const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createAudioResource, AudioPlayerStatus, entersState } = require("@discordjs/voice");
const gachaConfig = require("../../gamedata/gacha.json");
const { ensureUser, addToHistory } = require("../../utils/gachaState");
const { connectIfNeeded, music } = require("../../utils/musicState"); // For voice
const fs = require("fs");
const path = require("path");

// --- Pre-process data ---
const { resonators, weapons, rarities, rates, pity, banners } = gachaConfig;
const allItems = {
    resonators: new Map(resonators.map(r => [r.id, r])),
    weapons: new Map(weapons.map(w => [w.id, w]))
};
const itemPools = {
    standard_5_star_resonators: resonators.filter(r => r.rarity === 5 && r.type === 'Standard'),
    standard_4_star_resonators: resonators.filter(r => r.rarity === 4 && r.type === 'Standard'),
    standard_5_star_weapons: weapons.filter(w => w.rarity === 5 && w.type === 'Standard'),
    standard_4_star_weapons: weapons.filter(w => w.rarity === 4 && w.type === 'Standard'),
    standard_3_star_weapons: weapons.filter(w => w.rarity === 3 && w.type === 'Standard')
};
const dialogueAudioDir = path.join(__dirname, '..', '..', 'assets', 'audio', 'dialogue');

function getRandomFromPool(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
}

// --- Core Gacha Logic ---
function performPull(userId, bannerKey) {
    const banner = banners[bannerKey];
    const user = ensureUser(userId);
    const softPityConfig = gachaConfig.soft_pity[banner.type];
    
    // Tăng pity trước khi roll
    user.pity[bannerKey]++;
    user.pity_4[bannerKey]++;

    const currentPity5 = user.pity[bannerKey];
    const currentPity4 = user.pity_4[bannerKey];
    const bannerRates = rates[banner.type];
    
    // --- Tính toán tỉ lệ 5 sao hiệu quả (với Pity mềm) ---
    let effectiveRate5Star = bannerRates["5"]; // Bắt đầu với tỉ lệ gốc
    if (softPityConfig && currentPity5 >= softPityConfig.start_at_pity) {
        const pityStepsIntoSoft = currentPity5 - softPityConfig.start_at_pity;
        effectiveRate5Star += (pityStepsIntoSoft * softPityConfig.rate_increase);
    }
    
    let pulledRarity = null;
    let is5050Win = null;
    
    // --- Xác định độ hiếm dựa trên tỉ lệ đã tính ---
    if (currentPity5 >= pity.five_star) { // Pity cứng là bảo hiểm cuối cùng
        pulledRarity = 5;
    } else if (currentPity4 >= pity.four_star) { // Pity 4 sao
        pulledRarity = 4;
    } else {
        const roll = Math.random();
        if (roll < effectiveRate5Star) {
            pulledRarity = 5;
        } else if (roll < effectiveRate5Star + bannerRates["4"]) {
            pulledRarity = 4;
        } else {
            pulledRarity = 3;
        }
    }
    
    let pulledItem, itemType = banner.type;

    if (pulledRarity === 5) {
        if (banner.featured) { // Banner Featured
            const isGuaranteed = user.guarantee[bannerKey];
            const wins5050 = Math.random() < banner.rate_up_chance;

            if (isGuaranteed || wins5050) {
                const featuredPool = banner.type === 'character' ? allItems.resonators : allItems.weapons;
                pulledItem = featuredPool.get(banner.featured[0]);
                user.guarantee[bannerKey] = false;
                if (!isGuaranteed) is5050Win = true;
            } else { // Thua 50/50
                const standardPool = banner.type === 'character' ? itemPools.standard_5_star_resonators : itemPools.standard_5_star_weapons;
                pulledItem = getRandomFromPool(standardPool);
                user.guarantee[bannerKey] = true;
                is5050Win = false;
            }
        } else { // Banner Standard
            const pool = banner.type === 'character' ? itemPools.standard_5_star_resonators : itemPools.standard_5_star_weapons;
            pulledItem = getRandomFromPool(pool);
        }
        
        const pullData = { ...pulledItem, itemType, banner: bannerKey, pity: user.pity[bannerKey], timestamp: Date.now(), is5050Win };
        addToHistory(userId, pullData);
        user.pity[bannerKey] = 0; // Reset pity 5 sao
        user.pity_4[bannerKey] = 0; // Pity 4 sao cũng reset khi trúng 5 sao
        return pullData;

    } else if (pulledRarity === 4) {
        if (banner.rate_up_4_star && Math.random() < 0.5) {
             const featured4starId = getRandomFromPool(banner.rate_up_4_star);
             pulledItem = allItems.resonators.get(featured4starId);
        } else {
            const pool = [...itemPools.standard_4_star_resonators, ...itemPools.standard_4_star_weapons];
            pulledItem = getRandomFromPool(pool);
        }
        itemType = allItems.resonators.has(pulledItem.id) ? 'character' : 'weapon';
        
        const pullData = { ...pulledItem, itemType, banner: bannerKey, pity: user.pity_4[bannerKey], timestamp: Date.now() };
        addToHistory(userId, pullData);
        user.pity_4[bannerKey] = 0; // Reset pity 4 sao
        return pullData;

    } else { // 3-Star
        pulledItem = getRandomFromPool(itemPools.standard_3_star_weapons);
        itemType = 'weapon';
        
        const pullData = { ...pulledItem, itemType, banner: bannerKey, pity: 0, timestamp: Date.now() };
        addToHistory(userId, pullData);
        return pullData;
    }
}

async function playDialogueAudio(interaction, category) {
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;
    // Nếu người dùng không ở trong kênh thoại, không làm gì cả.
    if (!voiceChannel) return;

    try {
        const categoryDir = path.join(dialogueAudioDir, category);
        if (!fs.existsSync(categoryDir)) return;

        const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.mp3') || f.endsWith('.ogg') || f.endsWith('.wav'));
        if (files.length === 0) return;

        // Chọn một file ngẫu nhiên
        const randomFile = files[Math.floor(Math.random() * files.length)];
        const filePath = path.join(categoryDir, randomFile);

        // Kết nối vào kênh thoại và lấy trình phát nhạc
        const connectionState = await connectIfNeeded(interaction, voiceChannel, { selfDeaf: false });
        const player = connectionState.player;
        if (!player) return;

        const resource = createAudioResource(filePath);
        const wasPlayingMusic = player.state.status === AudioPlayerStatus.Playing;

        // Tạm dừng nhạc nếu đang phát
        player.stop(true);
        player.play(resource);

        // Chờ cho đến khi voice line kết thúc
        await entersState(player, AudioPlayerStatus.Idle, 30000);

        if (wasPlayingMusic) {
            console.log("[Dialogue Audio] Finished. Music queue will resume automatically.");
        }

    } catch (error) {
        if (error.code === 'ABORT_ERR' || error.name === 'AbortError') {
            console.log("[Dialogue Audio] Playback succeeded by the main music queue.");
        } else {
            console.error("[Dialogue Audio Error]", error);
        }
    }
}
module.exports = {
    data: new SlashCommandBuilder()
        .setName("gacha")
        .setDescription("Wuthering Waves-style gacha!")
        .addSubcommand(sub =>
            sub.setName("pull")
            .setDescription("Use Tides to convene a Resonator or Weapon")
            .addStringOption(opt =>
                opt.setName("banner")
                .setDescription("Choose the banner to pull from")
                .setRequired(true)
                .setChoices(
                    { name: "Featured Resonator", value: "character_featured" },
                    { name: "Featured Weapon", value: "weapon_featured" },
                    { name: "Standard Resonator", value: "character_standard" },
                    { name: "Standard Weapon", value: "weapon_standard" }
                )
            )
            .addIntegerOption(opt =>
                opt.setName("amount")
                .setDescription("Number of pulls")
                .setChoices({ name: "Convene x1", value: 1 }, { name: "Convene x10", value: 10 })
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub.setName("history").setDescription("View your gacha pull history"))
        .addSubcommand(sub => sub.setName("stats").setDescription("View your gacha statistics"))
        .addSubcommand(sub => sub.setName("pity").setDescription("Check your current pity counts")),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (subcommand === "pull") {
            const amount = interaction.options.getInteger("amount");
            const bannerKey = interaction.options.getString("banner");
            await interaction.deferReply();

            const results = [];
            for (let i = 0; i < amount; i++) {
                results.push(performPull(userId, bannerKey));
            }
            results.sort((a, b) => b.rarity - a.rarity);

            const description = results.map(item =>
                `${rarities[item.rarity].emoji} **${item.name}**`
            ).join("\n");
            
            const userState = ensureUser(userId);
            const pityCount = userState.pity[bannerKey];
            const guaranteeText = banners[bannerKey].featured && userState.guarantee[bannerKey] ? " (Guaranteed)" : "";

            const embed = new EmbedBuilder()
                .setTitle(`${banners[bannerKey].name} Results`)
                .setDescription(description)
                .setColor(rarities[results[0].rarity].color)
                .setFooter({ text: `5-Star Pity: ${pityCount}/${pity.five_star}${guaranteeText}` });

            const bestPull = results[0];
            if (bestPull.image) embed.setThumbnail(bestPull.image);
            
            await interaction.editReply({ embeds: [embed] });
            let audioCategory = null;
            let fallbackText = null; // Tin nhắn văn bản nếu người dùng không ở trong voice

            if (bestPull.rarity === 5) {
                if (bestPull.is5050Win === true) {
                    audioCategory = 'win_5050';
                    fallbackText = "Congratulation! You win the 50/50 🎉";
                } else if (bestPull.is5050Win === false) {
                    audioCategory = 'lose_5050';
                    fallbackText = "Sorry, you lost the 50/50... Better luck next time!";
                } else {
                    audioCategory = 'general_win';
                    fallbackText = "A 5-star character has come home!";
                }
            } else if (bestPull.rarity === 3 && amount === 10) {
                audioCategory = 'bad_pull';
                fallbackText = "Hmm, you weren't very lucky this time. Keep it up!";
            }

            // Nếu có danh mục âm thanh được chọn, thử phát nó
            if (audioCategory) {
                // Phát âm thanh trong nền, không cần chờ
                playDialogueAudio(interaction, audioCategory);
    
                // Nếu người dùng không ở trong kênh thoại, gửi tin nhắn dự phòng
                if (!interaction.member?.voice?.channel && fallbackText) {
                    try {
                        await interaction.followUp({ content: fallbackText });
                    } catch (e) {
                        console.log("Could not send gacha followup text message.");
                    }
                }
     }
        } else if (subcommand === "pity") {
            const userState = ensureUser(userId);
            const embed = new EmbedBuilder()
                .setTitle(`${interaction.user.username}'s Pity`)
                .setColor("#DDDDDD")
                .addFields(
                    { name: "Featured Resonator", value: `Pity: **${userState.pity.character_featured}/${pity.five_star}**\nGuaranteed: **${userState.guarantee.character_featured ? 'Yes' : 'No'}**` },
                    { name: "Featured Weapon", value: `Pity: **${userState.pity.weapon_featured}/${pity.five_star}**` },
                    { name: "Standard Resonator", value: `Pity: **${userState.pity.character_standard}/${pity.five_star}**` },
                    { name: "Standard Weapon", value: `Pity: **${userState.pity.weapon_standard}/${pity.five_star}**` }
                );
            await interaction.reply({ embeds: [embed] });

        } else if (subcommand === "history") {
            const { history } = ensureUser(userId);
            if (history.length === 0) {
                return interaction.reply({ content: "You have no pull history yet.", ephemeral: true });
            }

            const userHistory = [...history].reverse(); // Show most recent first
            const ITEMS_PER_PAGE = 10;
            const totalPages = Math.ceil(userHistory.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const generateEmbed = (page) => {
                const start = (page - 1) * ITEMS_PER_PAGE;
                const end = start + ITEMS_PER_PAGE;
                const currentItems = userHistory.slice(start, end);

                const description = currentItems.map((item, index) => {
                    const pullNum = userHistory.length - start - index;
                    const pityText = item.rarity > 3 ? `(Pity: ${item.pity})` : '';
                    return `**${pullNum}.** ${rarities[item.rarity].emoji} **${item.name}**\n*└ Banner: ${banners[item.banner].name} ${pityText}*`;
                }).join("\n\n");

                return new EmbedBuilder()
                    .setTitle(`${interaction.user.username}'s Gacha History`)
                    .setDescription(description)
                    .setColor("#0099ff")
                    .setFooter({ text: `Page ${page}/${totalPages} • Total Pulls: ${userHistory.length}` });
            };
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_prev').setLabel('◀️').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('gacha_next').setLabel('▶️').setStyle(ButtonStyle.Primary).setDisabled(totalPages <= 1)
            );
            const message = await interaction.reply({ embeds: [generateEmbed(currentPage)], components: [row], fetchReply: true });
            const collector = message.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 120000 });
            collector.on('collect', async i => {
                await i.deferUpdate();
                if (i.customId === 'gacha_next') currentPage++; else if (i.customId === 'gacha_prev') currentPage--;
                row.components[0].setDisabled(currentPage === 1); row.components[1].setDisabled(currentPage === totalPages);
                await message.edit({ embeds: [generateEmbed(currentPage)], components: [row] });
            });
            collector.on('end', async () => { row.components.forEach(c => c.setDisabled(true)); await message.edit({ components: [row] }).catch(() => {}); });
        
        } else if (subcommand === "stats") {
            const { history } = ensureUser(userId);
            if (history.length < 10) {
                return interaction.reply({ content: "You need more pull history to generate meaningful stats.", ephemeral: true });
            }

            const stats = {};
            for (const key in banners) {
                stats[key] = { pulls: 0, five_stars: [], four_stars: 0 };
            }
            let wins = 0, losses = 0;

            for (const pull of history) {
                if (!stats[pull.banner]) continue;
                stats[pull.banner].pulls++;
                if (pull.rarity === 5) {
                    stats[pull.banner].five_stars.push(pull);
                    if (pull.is5050Win === true) wins++;
                    else if (pull.is5050Win === false) losses++;
                } else if (pull.rarity === 4) {
                    stats[pull.banner].four_stars++;
                }
            }
            
            const five_star_pity_sum = history.filter(p=>p.rarity===5).reduce((acc, p) => acc + p.pity, 0);
            const total_five_stars = history.filter(p=>p.rarity===5).length;
            const avg_pity = total_five_stars > 0 ? (five_star_pity_sum / total_five_stars).toFixed(2) : 'N/A';

            const five_star_log = history.filter(p => p.rarity === 5).map(p => `**${p.name}** at pity ${p.pity}`).join('\n') || 'None';

            const embed = new EmbedBuilder()
                .setTitle(`${interaction.user.username}'s Gacha Stats`)
                .setColor("#FFD700")
                .setDescription(`**Total Pulls:** ${history.length}\n**Avg. 5-Star Pity:** ${avg_pity}`)
                .addFields(
                    { name: 'Featured Resonator Banner', value: `Pulls: ${stats.character_featured.pulls}\n5-Stars: ${stats.character_featured.five_stars.length}\n4-Stars: ${stats.character_featured.four_stars}` },
                    { name: '50/50 Record (Character)', value: `Wins: ${wins}\nLosses: ${losses}\nRate: ${wins+losses > 0 ? ((wins/(wins+losses))*100).toFixed(1)+'%' : 'N/A'}`},
                    { name: 'Recent 5-Star Pulls', value: five_star_log.substring(0, 1024) }
                );
            await interaction.reply({ embeds: [embed] });
        }
    }
};