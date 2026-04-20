FROM node:22-slim

# Install Chromium and git
RUN apt-get update && apt-get install -y \
    chromium \
    git \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates

# Fix git SSL for Railway containers
ENV GIT_SSL_NO_VERIFY=true

# Tell Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install all deps (including devDeps for tsc), build, then prune
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc && npm prune --omit=dev

# Auth and vault will be mounted as volumes
RUN mkdir -p /data/auth /data/vault

CMD ["node", "dist/index.js"]
