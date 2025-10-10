# Use a Node.js base image (upgraded to 20 to meet engine requirements)
FROM node:20-slim

# Install ffmpeg and python3 (including pip for yt-dlp-exec requirements) during the Docker build
RUN apt-get update -y && \
    apt-get install -y ffmpeg python3 python3-pip && \
    rm -rf /var/lib/apt/lists/* # Clean up apt cache to keep image size down

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy the rest of your application code
COPY . .

# Build the application (if applicable)
# RUN npm run build

# Expose the port your app runs on
EXPOSE 3000 
# Change to your app's port if different

# Command to run the application
CMD ["npm", "start"]