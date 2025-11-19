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
    .setDescription('Chơi máy đánh bạc để thử vận may của bạn!'),
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
                    resultMessage = '🎉 **JACKPOT!** 🎉\nBạn đã trúng giải độc đắc!';
                    resultColor = '#FFD700'; // Vàng gold
                    break;
                case '💎':
                    resultMessage = '💎 **BIG WIN!** 💎\nMột chiến thắng lớn!';
                    resultColor = '#00BFFF'; // Xanh dương
                    break;
                case '🍀':
                    resultMessage = '🍀 **LUCKY WIN!** 🍀\nRất may mắn!';
                    resultColor = '#32CD32'; // Xanh lá
                    break;
                case '🔔':
                    resultMessage = '🔔 **You win!** 🔔\nBạn đã thắng!';
                    resultColor = '#9370DB'; // Tím
                    break;
                default: // Dành cho 🍇 và 🍒
                    resultMessage = '🍇 **Small Win!** 🍒\nMột chiến thắng nhỏ!';
                    resultColor = '#FFA500'; // Cam
                    break;
            }
        } else {
            resultMessage = '💔 **You lost.** 💔\nChúc bạn may mắn lần sau!';
            resultColor = '#808080'; // Xám
        }

        const embed = new EmbedBuilder()
            .setColor(resultColor)
            .setTitle('🎰 Slot Machine 🎰')
            .setDescription(`Vòng quay của ${interaction.user.username}:\n\n${reelsDisplay}`)
            .addFields({ name: 'Kết quả', value: resultMessage })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Lỗi trong lệnh /slot:', err);
      await interaction.editReply('❌ Đã có lỗi xảy ra khi quay máy đánh bạc.');
    }
  }
};