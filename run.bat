@echo off
cd /d "C:\Project\Bot"
pm2 start src/index.js --name "suisei" --wait-ready --restart-delay 10000
exit