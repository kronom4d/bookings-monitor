FROM node:20-slim

# Install Chromium from the system package manager.
# This avoids Puppeteer downloading its own bundled Chrome (~300 MB).
RUN apt-get update && apt-get install -y chromium --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY index.js ./

CMD ["node", "index.js"]
