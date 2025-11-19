// src/handlers/scheduleHandler.js
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

function startScheduledTasks(client) {
    console.log('⏰ Trình lập lịch đã được kích hoạt.');

    // Lên lịch tác vụ chạy vào 7:00 sáng, vào ngày Chủ Nhật.
    // Cú pháp cron: Phút Giờ Ngày(tháng) Tháng Ngày(tuần)
    // '0 7 * * 0' -> 0 phút, 7 giờ, bất kỳ ngày nào, bất kỳ tháng nào, ngày Chủ Nhật (0)
    cron.schedule('0 7 * * 0', async () => {
        console.log('🚀 Đang chạy tác vụ gửi video Chủ Nhật hàng tuần...');

        const channelId = process.env.SCHEDULED_VIDEO_CHANNEL_ID;
        const videoPath = process.env.SCHEDULED_VIDEO_PATH;

        // --- Kiểm tra tính hợp lệ ---
        if (!channelId || !videoPath) {
            console.error('❌ Vui lòng thiết lập SCHEDULED_VIDEO_CHANNEL_ID và SCHEDULED_VIDEO_PATH trong file .env');
            return;
        }

        const absoluteVideoPath = path.resolve(videoPath);
        if (!fs.existsSync(absoluteVideoPath)) {
            console.error(`❌ Không tìm thấy file video tại đường dẫn: ${absoluteVideoPath}`);
            return;
        }

        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) {
                console.error(`❌ Không tìm thấy kênh với ID: ${channelId}`);
                return;
            }

            // Gửi video
            await channel.send({
                content: "Chào buổi sáng Chủ Nhật! ☀️ Chúc mọi người một ngày cuối tuần vui vẻ!",
                files: [absoluteVideoPath]
            });

            console.log(`✅ Đã gửi video thành công đến kênh ${channel.name}.`);

        } catch (error) {
            console.error('❌ Đã xảy ra lỗi khi thực hiện tác vụ gửi video:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Ho_Chi_Minh" // Đặt múi giờ cho Việt Nam
    });
}

module.exports = { startScheduledTasks };