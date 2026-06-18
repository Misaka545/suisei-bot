const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

// Định nghĩa các biểu tượng và sắp xếp chúng từ hiếm nhất đến phổ biến nhất
// 💰(Jackpot) -> 💎(Hiếm) -> 🍀(Hiếm) -> 🔔(Trung bình) -> 🍇(Phổ biến) -> 🍒(Phổ biến)
const symbols = [
    '💰', '💰', // Tăng cơ hội ra 💰 một chút so với chỉ 1
    '💎', '💎', '💎',
    '🍀', '🍀', '🍀', '🍀',
    '🔔', '🔔', '🔔', '🔔', '🔔',
    '🍇', '🍇', '🍇', '🍇', '🍇', '🍇',
    '🍒', '🍒', '🍒', '🍒', '🍒', '🍒', '🍒'
];

// Hàm để "quay" và lấy ra 3 kết quả ngẫu nhiên
function spinReels() {
    const results = [];
    for (let i = 0; i < 3; i++) {
        const randomIndex = Math.floor(Math.random() * symbols.length);
        results.push(symbols[randomIndex]);
    }
    return results;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slot')
    .setDescription('Play the slot machine and test your luck!'),
  async execute(interaction) {
    try {
        await interaction.deferReply();

        const reels = spinReels();
        const reelsDisplay = `**[ ${reels.join(' | ')} ]**`;

        let resultMessage;
        let resultColor;

        // Kiểm tra điều kiện thắng (3 biểu tượng giống nhau)
        if (reels[0] === reels[1] && reels[1] === reels[2]) {
            const symbol = reels[0];
            switch (symbol) {
                case '💰':
                    resultMessage = '🎉 **JACKPOT!** 🎉\nYou hit the jackpot!';
                    resultColor = '#FFD700'; // Vàng gold
                    break;
                case '💎':
                    resultMessage = '💎 **BIG WIN!** 💎\nA big victory!';
                    resultColor = '#00BFFF'; // Xanh dương
                    break;
                case '🍀':
                    resultMessage = '🍀 **LUCKY WIN!** 🍀\nVery lucky!';
                    resultColor = '#32CD32'; // Xanh lá
                    break;
                case '🔔':
                    resultMessage = '🔔 **You win!** 🔔\nYou won!';
                    resultColor = '#9370DB'; // Tím
                    break;
                default: // Dành cho 🍇 và 🍒
                    resultMessage = '🍇 **Small Win!** 🍒\nA small win!';
                    resultColor = '#FFA500'; // Cam
                    break;
            }
        } else {
            resultMessage = '💔 **You lost.** 💔\nBetter luck next time!';
            resultColor = '#808080'; // Xám
        }

        const embed = new EmbedBuilder()
            .setColor(resultColor)
            .setAuthor({ name: 'Slot Machine' })
            .setDescription(`${interaction.user.username}'s spin:\n\n${reelsDisplay}`)
            .addFields({ name: 'Result', value: resultMessage })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Lỗi trong lệnh /slot:', err);
      await interaction.editReply('An error occurred while spinning the slot machine.');
    }
  }
};