# Use a Node.js base image (adjust version as needed)
FROM node:18-slim-bullseye 

# Install ffmpeg during the Docker build
RUN apt-get update -y && apt-get install -y ffmpeg

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if you use it)
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy the rest of your application code
COPY . .

# Define the command to run your application
CMD ["node", "src/index.js"]