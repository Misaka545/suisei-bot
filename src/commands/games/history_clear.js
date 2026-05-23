const { SlashCommandBuilder } = require("discord.js");
const { ensureUser } = require("../../utils/gachaState");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("history_clear")
        .setDescription("Permanently deletes your gacha pull history and resets pity."),
    async execute(interaction) {
        const userId = interaction.user.id;
        const user = ensureUser(userId);

        // Reset all data
        user.history = [];
        user.pity = { character_featured: 0, weapon_featured: 0, character_standard: 0, weapon_standard: 0 };
        user.pity_4 = { character_featured: 0, weapon_featured: 0, character_standard: 0, weapon_standard: 0 };
        user.guarantee = { character_featured: false };

        await interaction.reply({ 
            content: "🧹 Your gacha history, pity, and guarantees have been successfully cleared.",
            ephemeral: true 
        });
    },
};