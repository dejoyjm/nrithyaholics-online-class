FROM ghcr.io/puppeteer/puppeteer:21.0.0

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Use Chrome bundled in the Puppeteer image
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Install yt-dlp for YouTube audio extraction
USER root
RUN apt-get update && apt-get install -y python3 curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
USER pptruser

EXPOSE 3000
CMD ["node", "index.js"]
