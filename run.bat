@echo off
cd /d "C:\suisei-bot"
pm2 start src/index.js --name "suisei" --wait-ready --restart-delay 10000
exit