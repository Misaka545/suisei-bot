// src/handlers/scheduleHandler.js
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { getAllTasks, removeTask } = require('../utils/schedulerUtils');

function startScheduledTasks(client) {
    console.log('⏰ Hệ thống lập lịch đã khởi động.');

    // 1. Cron Job Cũ (Gửi video chủ nhật) - Giữ nguyên
    cron.schedule('0 12 * * 0', async () => {
        /* ... Code cũ của bạn giữ nguyên ở đây ... */
        // (Đoạn code gửi video "Weekend naisu" của bạn)
    }, { scheduled: true, timezone: "Asia/Ho_Chi_Minh" });


    // 2. Cron Job Mới: Quét file JSON mỗi phút để xử lý task người dùng
    cron.schedule('* * * * *', async () => {
        const tasks = getAllTasks();
        const now = Date.now();

        // Lọc ra các task đã đến giờ (hoặc quá giờ một chút do bot tắt)
        const dueTasks = tasks.filter(t => t.timestamp <= now);

        if (dueTasks.length === 0) return;

        console.log(`🚀 Tìm thấy ${dueTasks.length} task cần thực hiện.`);

        for (const task of dueTasks) {
            try {
                // Fetch kênh
                const channel = await client.channels.fetch(task.channelId).catch(() => null);
                
                if (channel) {
                    const payload = {};
                    if (task.content) payload.content = task.content;
                    
                    // Xử lý file đính kèm
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
                // Luôn xóa task sau khi đã cố gắng chạy (thành công hay thất bại) để tránh lặp lại
                removeTask(task.id);
            }
        }
    });
}

module.exports = { startScheduledTasks };