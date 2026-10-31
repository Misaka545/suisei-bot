@echo off
cd /d "%~dp0"

echo Checking for yt-dlp updates...
if exist "%~dp0bin\yt-dlp.exe" (
    call "%~dp0bin\yt-dlp.exe" -U
)

echo Starting Docker containers (Piston and VOICEVOX)...
@REM call docker-compose -f piston-docker-compose.yml up -d
call docker compose -f voicevox-docker-compose.yml up -d


echo.
echo Starting Suisei Bot with PM2...
call pm2 start ecosystem.config.js

echo Saving PM2 state...
call pm2 save

echo.
echo Bot and RPC are running in the background!
echo To view logs, run: pm2 logs
echo To stop, run: pm2 stop ecosystem.config.js
echo.
pause
