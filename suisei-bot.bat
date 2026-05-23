@echo off
cd /d "%~dp0"

echo Starting Suisei Bot with PM2...
call pm2 start src/index.js --name "suisei-bot"

echo Saving PM2 state...
call pm2 save

echo.
echo Bot is running in the background!
echo To view logs, run: pm2 logs suisei-bot
echo To stop the bot, run: pm2 stop suisei-bot
echo.
pause
