# Railway Worker Deployment

This repo is ready to deploy the worker as a Railway cron service.

## What Runs

- Start command: `npm run worker:railway`
- Default job: full ingestion batch, running `offers`, then `marketing`, then `ads`
- Schedule: `0 2 * * *`
- Runtime: Docker, based on the official Playwright image so browser scrapers can run
- Logs: structured JSON lines in Railway logs, linked by `batchRunId`

## Required Railway Variables

Set these on the Railway worker service:

```bash
DATABASE_URL=...
DATAFORSEO_LOGIN=developer@summon.co
DATAFORSEO_PASSWORD=...
DATAFORSEO_GOOGLE_LOCATION_NAME=United Kingdom
DATAFORSEO_GOOGLE_PLATFORM=all
DATAFORSEO_ADS_DEPTH=120
ADS_OCR_ENABLED=true
ADS_OCR_MAX_PER_COMPETITOR=0
```

Use the existing Railway Postgres connection string for `DATABASE_URL`, or reference the Railway Postgres service variable if the worker is in the same Railway project.

## Railway Setup

1. Create a new Railway service from the GitHub repo.
2. Keep the root directory as the repo root.
3. Railway will detect `railway.json` and build with `Dockerfile`.
4. Add the variables above in the service Variables tab.
5. Deploy.
6. Check deploy logs for `batch.started`, `competitor.finished`, and `batch.finished`.

## Manual Local Test

```bash
npm run worker:all
npm run worker -- inspect --latest
```

For one module only:

```bash
npm run worker:offers
npm run worker:marketing
npm run worker:ads
```

For one competitor only:

```bash
npm run worker -- run --module offers --competitor ionian-island-holidays
npm run worker -- run --module ads --competitor tui
```

To reclassify existing ad snapshots after destination keyword updates:

```bash
npm run worker -- backfill-ads
npm run worker -- backfill-ads --ocr-missing
```

## Separate Cron Services

If the full batch becomes too slow, duplicate the Railway worker service and override the start command per service:

```bash
npm run worker -- run --module offers
npm run worker -- run --module marketing
npm run worker -- run --module ads
```
