@echo off
cd /d "%~dp0"
title Bot Rich Presence
echo ========================================================
echo                Discord Rich Presence
echo ========================================================
echo.
echo Make sure Discord Desktop is running on your computer.
echo Press Ctrl+C anytime to stop.
echo.
node src/rpc/botPresence.js
pause
