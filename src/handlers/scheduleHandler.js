// src/handlers/scheduleHandler.js
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { getAllTasks, removeTasks } = require('../utils/schedulerUtils');
const { autoUpdateYtdlp } = require('../utils/youtubeHelpers');

function startScheduledTasks(client) {
    console.log('⏰ Hệ thống lập lịch đã khởi động.');

    // Tự động kiểm tra và cập nhật yt-dlp hàng ngày lúc 04:00 sáng
    cron.schedule('0 4 * * *', async () => {
        try {
            console.log('⏰ [Cron] Đang kiểm tra cập nhật yt-dlp định kỳ...');
            const res = await autoUpdateYtdlp();
            console.log(`✅ [Cron] Kết quả cập nhật yt-dlp: ${res?.message || 'Hoàn tất'}`);
        } catch (err) {
            console.error('❌ Lỗi khi tự động cập nhật yt-dlp:', err);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Ho_Chi_Minh"
    });

    cron.schedule('0 8 * * 0', async () => {
        try {
            const SUNDAY_CHANNEL_ID = process.env.SCHEDULED_CHANNEL_ID; 
            const VIDEO_URL = process.env.SCHEDULED_VIDEO_PATH;
            
            if (!SUNDAY_CHANNEL_ID || !VIDEO_URL) {
                return console.warn('⚠️ SCHEDULED_CHANNEL_ID hoặc SCHEDULED_VIDEO_PATH chưa được cấu hình.');
            }

            console.log('🔄 Đang thực hiện task Chủ nhật...');

            const channel = await client.channels.fetch(SUNDAY_CHANNEL_ID).catch(() => null);

            if (channel) {
                await channel.send({
                    content: "Cuối tuần vui vẻ! 🥳",
                    files: [VIDEO_URL]
                });
                console.log('✅ Đã gửi video Sunday thành công.');
            } else {
                console.warn(`⚠️ Không tìm thấy kênh ${SUNDAY_CHANNEL_ID} cho task Chủ nhật.`);
            }
        } catch (err) {
            console.error('❌ Lỗi khi gửi video Chủ nhật:', err);
        }
    }, { 
        scheduled: true, 
        timezone: "Asia/Ho_Chi_Minh" 
    });

    cron.schedule('* * * * *', async () => {
        const tasks = getAllTasks();
        const now = Date.now();

        const dueTasks = tasks.filter(t => t.timestamp <= now);

        if (dueTasks.length === 0) return;

        console.log(`🚀 Tìm thấy ${dueTasks.length} task cần thực hiện.`);
        const executedTaskIds = [];

        for (const task of dueTasks) {
            try {
                const channel = await client.channels.fetch(task.channelId).catch(() => null);
                
                if (channel) {
                    const payload = {};
                    if (task.content) payload.content = task.content;
                    
                    if (task.attachmentUrl) {
                        payload.files = [{
                            attachment: task.attachmentUrl,
                            name: task.attachmentName || 'file'
                        }];
                    }

                    await channel.send(payload);
                    console.log(`✅ Task ${task.id} executed.`);
                } else {
                    console.warn(`⚠️ Không tìm thấy kênh cho task ${task.id}, sẽ xóa task.`);
                }
            } catch (err) {
                console.error(`❌ Lỗi khi chạy task ${task.id}:`, err);
            } finally {
                executedTaskIds.push(task.id);
            }
        }

        if (executedTaskIds.length > 0) {
            removeTasks(executedTaskIds);
        }
    });
}

module.exports = { startScheduledTasks };