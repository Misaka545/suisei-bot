const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { createAudioResource, AudioPlayerStatus, entersState } = require("@discordjs/voice");
const { createCanvas, loadImage } = require('canvas');
const gachaConfig = require("../../gamedata/gacha.json");
const { ensureUser, addToHistory } = require("../../utils/gachaState");
const { connectIfNeeded } = require("../../utils/musicState");
const fs = require("fs");
const path = require("path");

// --- Define paths to asset directories ---
const gachaImageDir = path.join(__dirname, '..', '..', 'assets', 'images', 'gacha');
const uiImageDir = path.join(__dirname, '..', '..', 'assets', 'images', 'ui');
const dialogueAudioDir = path.join(__dirname, '..', '..', 'assets', 'audio', 'dialogue');

// --- Pre-process data (remains the same) ---
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

function getRandomFromPool(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
}

// --- Core Gacha Logic (remains the same) ---
function performPull(userId, bannerKey) {
    const banner = banners[bannerKey];
    const user = ensureUser(userId);
    const softPityConfig = gachaConfig.soft_pity[banner.type];
    
    user.pity[bannerKey]++;
    user.pity_4[bannerKey]++;

    const currentPity5 = user.pity[bannerKey];
    const currentPity4 = user.pity_4[bannerKey];
    const bannerRates = rates[banner.type];
    
    let effectiveRate5Star = bannerRates["5"];
    if (softPityConfig && currentPity5 >= softPityConfig.start_at_pity) {
        const pityStepsIntoSoft = currentPity5 - softPityConfig.start_at_pity;
        effectiveRate5Star += (pityStepsIntoSoft * softPityConfig.rate_increase);
    }
    
    let pulledRarity = null, is5050Win = null;
    
    if (currentPity5 >= pity.five_star) pulledRarity = 5;
    else if (currentPity4 >= pity.four_star) pulledRarity = 4;
    else {
        const roll = Math.random();
        if (roll < effectiveRate5Star) pulledRarity = 5;
        else if (roll < effectiveRate5Star + bannerRates["4"]) pulledRarity = 4;
        else pulledRarity = 3;
    }
    
    let pulledItem, itemType = banner.type;

    if (pulledRarity === 5) {
        if (banner.featured) {
            const isGuaranteed = user.guarantee[bannerKey];
            const wins5050 = Math.random() < banner.rate_up_chance;
            if (isGuaranteed || wins5050) {
                const featuredPool = banner.type === 'character' ? allItems.resonators : allItems.weapons;
                pulledItem = featuredPool.get(banner.featured[0]);
                user.guarantee[bannerKey] = false;
                if (!isGuaranteed) is5050Win = true;
            } else {
                const standardPool = banner.type === 'character' ? itemPools.standard_5_star_resonators : itemPools.standard_5_star_weapons;
                pulledItem = getRandomFromPool(standardPool);
                user.guarantee[bannerKey] = true;
                is5050Win = false;
            }
        } else {
            const pool = banner.type === 'character' ? itemPools.standard_5_star_resonators : itemPools.standard_5_star_weapons;
            pulledItem = getRandomFromPool(pool);
        }
        const pullData = { ...pulledItem, itemType, banner: bannerKey, pity: user.pity[bannerKey], timestamp: Date.now(), is5050Win };
        addToHistory(userId, pullData);
        user.pity[bannerKey] = 0;
        user.pity_4[bannerKey] = 0;
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
        user.pity_4[bannerKey] = 0;
        return pullData;
    } else {
        pulledItem = getRandomFromPool(itemPools.standard_3_star_weapons);
        itemType = 'weapon';
        const pullData = { ...pulledItem, itemType, banner: bannerKey, pity: 0, timestamp: Date.now() };
        addToHistory(userId, pullData);
        return pullData;
    }
}

async function createGachaResultImage(results, raritiesConfig) {
    // --- Define layout properties ---
    const imageWidth = 140;      // Width of the item image
    const imageHeight = 140;     // Height of the item image
    const textHeight = 40;       // Space below the image for the name
    const padding = 15;          // Space between cards
    const cardWidth = imageWidth;
    const cardHeight = imageHeight + textHeight;

    const canvasWidth = (cardWidth * 5) + (padding * 6);
    const canvasHeight = (cardHeight * 2) + (padding * 3);

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // --- Load the new background asset ---
    const backgroundImage = await loadImage(path.join(uiImageDir, 'background_new.png'));
    ctx.drawImage(backgroundImage, 0, 0, canvasWidth, canvasHeight);
    
    for (let i = 0; i < results.length; i++) {
        const item = results[i];
        const rarityInfo = raritiesConfig[item.rarity];
        const row = Math.floor(i / 5), col = i % 5;
        const x = padding + col * (cardWidth + padding);
        const y = padding + row * (cardHeight + padding);

        // 1. Draw a semi-transparent background for the image area
        ctx.fillStyle = 'rgba(10, 10, 20, 0.4)';
        ctx.fillRect(x, y, imageWidth, imageHeight);
        
        // 2. Draw the item's image
        try {
            if (!item.image) throw new Error('Missing image filename');
            const imagePath = path.join(gachaImageDir, item.image);
            const imageBuffer = fs.readFileSync(imagePath);
            const itemImage = await loadImage(imageBuffer);
            ctx.drawImage(itemImage, x, y, imageWidth, imageHeight);
        } catch (err) {
            console.warn(`Could not load local image for ${item.name} (${item.image}): ${err.message}.`);
            // Draw a placeholder if image fails
            ctx.fillStyle = '#202225'; ctx.fillRect(x, y, imageWidth, imageHeight);
            ctx.fillStyle = '#FFFFFF'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(item.name, x + imageWidth / 2, y + imageHeight / 2);
        }

        // 3. Draw the colored rarity line below the image
        ctx.fillStyle = rarityInfo.lineColor || '#4983BF'; // Default to 3-star color
        ctx.fillRect(x, y + imageHeight, imageWidth, 4); // 4px tall line

        // 4. Draw the item's name
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.name, x + imageWidth / 2, y + imageHeight + (textHeight / 2) + 2);
    }
    
    return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'gacha-result.png' });
}

async function playDialogueAudio(interaction, category) {
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) return;

    try {
        const categoryDir = path.join(dialogueAudioDir, category);
        if (!fs.existsSync(categoryDir)) return;
        const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.mp3'));
        if (files.length === 0) return;
        const randomFile = files[Math.floor(Math.random() * files.length)];
        const filePath = path.join(categoryDir, randomFile);
        const connectionState = await connectIfNeeded(interaction, voiceChannel, { selfDeaf: false });
        const player = connectionState.player;
        if (!player) return;
        const resource = createAudioResource(filePath);
        const wasPlayingMusic = player.state.status === AudioPlayerStatus.Playing;
        player.stop(true);
        player.play(resource);
        await entersState(player, AudioPlayerStatus.Idle, 30000);
        if (wasPlayingMusic) {
            console.log("[Dialogue Audio] Finished. Music queue will resume automatically.");
        }
    } catch (error) {
        if (error.code !== 'ABORT_ERR' && error.name !== 'AbortError') {
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
            results.sort((a, b) => b.rarity - a.rarity); // Sort to find best pull easily

            const userState = ensureUser(userId);
            const pityCount = userState.pity[bannerKey];
            const guaranteeText = banners[bannerKey].featured && userState.guarantee[bannerKey] ? " (Guaranteed)" : "";
            const bestPull = results[0];

            if (amount === 1) {
                // For single pulls, show a simple embed
                const embed = new EmbedBuilder()
                    .setTitle(`${banners[bannerKey].name} Result`)
                    .setDescription(`You received: ${rarities[bestPull.rarity].emoji} **${bestPull.name}**`)
                    .setColor(rarities[bestPull.rarity].color)
                    .setFooter({ text: `5-Star Pity: ${pityCount}/${pity.five_star}${guaranteeText}` });
                if (bestPull.image) embed.setImage(bestPull.image);
                await interaction.editReply({ embeds: [embed] });
            } else {
                // For 10-pulls, generate and show the grid image
                const attachment = await createGachaResultImage(results, rarities);
                const embed = new EmbedBuilder()
                    .setTitle(`${banners[bannerKey].name} Results`)
                    .setDescription(`Congratulations, ${interaction.user.username}! Here are your pulls:`)
                    .setColor(rarities[bestPull.rarity].color)
                    .setImage('attachment://gacha-result.png') // Refer to the attached image
                    .setFooter({ text: `5-Star Pity: ${pityCount}/${pity.five_star}${guaranteeText}` });

                await interaction.editReply({ embeds: [embed], files: [attachment] });
            }

            // --- Audio Feedback Logic (remains the same) ---
            let audioCategory = null;
            let fallbackText = null;
            if (bestPull.rarity === 5) {
                if (bestPull.is5050Win === true) { audioCategory = 'win_5050'; fallbackText = "Congratulations! You won the 50/50 🎉"; } 
                else if (bestPull.is5050Win === false) { audioCategory = 'lose_5050'; fallbackText = "Sorry, you lost the 50/50... Better luck next time!"; } 
                else { audioCategory = 'general_win'; fallbackText = "A 5-star has come home!"; }
            } else if (bestPull.rarity === 3 && amount === 10) {
                audioCategory = 'bad_pull'; fallbackText = "Hmm, you weren't very lucky this time. Keep it up!";
            }

            if (audioCategory) {
                playDialogueAudio(interaction, audioCategory);
                if (!interaction.member?.voice?.channel && fallbackText) {
                    await interaction.followUp({ content: fallbackText, ephemeral: true }).catch(() => {});
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
            if (history.length === 0) return interaction.reply({ content: "You have no pull history yet.", ephemeral: true });

            const userHistory = [...history].reverse();
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
            if (history.length < 10) return interaction.reply({ content: "You need more pull history to generate meaningful stats.", ephemeral: true });

            const stats = {};
            for (const key in banners) stats[key] = { pulls: 0, five_stars: [], four_stars: 0 };
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