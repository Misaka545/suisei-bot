// src/handlers/scheduleHandler.js
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { getAllTasks, removeTasks } = require('../utils/schedulerUtils');
const { autoUpdateYtdlp } = require('../utils/youtubeHelpers');

function startScheduledTasks(client) {
    console.log('⏰ Scheduled tasks started.');

    // Tự động kiểm tra và cập nhật yt-dlp hàng ngày lúc 04:00 sáng
    cron.schedule('0 4 * * *', async () => {
        try {
            console.log('⏰ [Cron] Checking for periodic yt-dlp updates...');
            const res = await autoUpdateYtdlp();
            console.log(`✅ [Cron] yt-dlp update result: ${res?.message || 'Completed'}`);
        } catch (err) {
            console.error('❌ Error during automatic yt-dlp update:', err);
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
                return console.warn('⚠️ SCHEDULED_CHANNEL_ID or SCHEDULED_VIDEO_PATH is not configured.');
            }

            console.log('🔄 Executing Sunday task...');

            const channel = await client.channels.fetch(SUNDAY_CHANNEL_ID).catch(() => null);

            if (channel) {
                await channel.send({
                    content: "Happy weekend! 🥳",
                    files: [VIDEO_URL]
                });
                console.log('✅ Sunday video sent successfully.');
            } else {
                console.warn(`⚠️ Channel ${SUNDAY_CHANNEL_ID} not found for Sunday task.`);
            }
        } catch (err) {
            console.error('❌ Error sending Sunday video:', err);
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

        console.log(`🚀 Found ${dueTasks.length} task(s) to execute.`);
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
                    console.warn(`⚠️ Channel not found for task ${task.id}, deleting task.`);
                }
            } catch (err) {
                console.error(`❌ Error executing task ${task.id}:`, err);
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