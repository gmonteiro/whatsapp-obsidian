FROM node:22-slim

# Install Chromium and git
RUN apt-get update && apt-get install -y \
    chromium \
    git \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Auth and vault will be mounted as volumes
RUN mkdir -p /data/auth /data/vault

CMD ["node", "dist/index.js"]
