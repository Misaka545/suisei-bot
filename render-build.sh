#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Installing node dependencies..."
npm install

echo "Downloading yt-dlp binary for Linux..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp || curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./yt-dlp

echo "Setting permissions..."
chmod a+rx ./yt-dlp || true

echo "Build complete."
