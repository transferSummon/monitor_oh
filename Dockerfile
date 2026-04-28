FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

ENV NODE_OPTIONS=--max-old-space-size=4096
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/scraper-engine/package.json packages/scraper-engine/package.json
COPY packages/worker/package.json packages/worker/package.json

RUN npm ci

COPY . .

RUN npm run contracts:build \
  && npm run db:build \
  && npm run scrape:build \
  && npm run worker:build

ENV NODE_ENV=production

CMD ["npm", "run", "worker:railway"]
