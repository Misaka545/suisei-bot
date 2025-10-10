# Use a Node.js base image (upgraded to 22 to meet engine requirements for @discordjs/voice)
FROM node:22-slim

# Install ffmpeg, python3, python3-pip, and create a symlink for 'python'
RUN apt-get update -y && \
    apt-get install -y ffmpeg python3 python3-pip && \
    ln -s /usr/bin/python3 /usr/local/bin/python && \
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

# Command to run the application
CMD ["npm", "start"]