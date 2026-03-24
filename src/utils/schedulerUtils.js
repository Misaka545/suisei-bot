// src/utils/schedulerUtils.js
const fs = require('fs');
const path = require('path');

// Đường dẫn file lưu trữ
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'scheduledTasks.json');

// Đảm bảo thư mục và file tồn tại
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify([]), 'utf-8');
}

function getAllTasks() {
    try {
        const data = fs.readFileSync(FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Lỗi đọc file schedule:', err);
        return [];
    }
}

function saveTask(task) {
    const tasks = getAllTasks();
    tasks.push(task);
    fs.writeFileSync(FILE_PATH, JSON.stringify(tasks, null, 2), 'utf-8');
}

function removeTask(taskId) {
    let tasks = getAllTasks();
    tasks = tasks.filter(t => t.id !== taskId);
    fs.writeFileSync(FILE_PATH, JSON.stringify(tasks, null, 2), 'utf-8');
}

module.exports = { getAllTasks, saveTask, removeTask };