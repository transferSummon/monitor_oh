# Olympic Holiday Monitor Plan

## 1. What The Reference System Actually Does

The `WWT Monitor` reference project is not just a frontend.

It has 4 parts:

1. A React dashboard with 4 pages:
   - Ads
   - Live Prices / Offers
   - Marketing Offers
   - Notifications
2. A PostgreSQL database storing competitors, destinations, ads, offers, marketing offers, statuses, and alerts
3. n8n ingestion workflows that scrape competitors, call external APIs, classify destinations, and calculate status changes
4. n8n webhook endpoints that expose read-only data to the frontend

The important conclusion:

- The product value lives in the ingestion and status logic, not in the frontend alone.
- Rebuilding this properly means replacing both the n8n workflows and the public n8n read endpoints.

## 2. Reverse-Engineered Behaviour To Preserve

From the reference project and docs:

- Ads dashboard:
  - Google Ads / creative monitoring
  - status tabs: `new`, `active`, `changed`, `removed`
  - competitor and destination filters
  - summary counts
- Offers dashboard:
  - normalized live travel offers
  - same lifecycle statuses
  - competitor and destination filters
  - per-offer diff/alert behaviour
- Marketing offers:
  - homepage promo extraction
  - dedupe using a normalized source key
  - alerts for new homepage promotions
- Notifications:
  - unified feed of offer and marketing-offer alerts

Current Olympic Holiday input found in [Competitors.docx](/Users/sergeysotskiy/Documents/summon/olympic_monitor/Competitors.docx):

- Jet2
- easyJet Holidays
- TUI
- Sunvil
- Ionian Island Holidays
- loveholidays

The URLs in the document include tracking parameters and should be normalized before they are stored.

## 3. Main Problems In The Current WWT Build

These are the parts worth fixing in the rewrite:

- The browser calls public n8n webhook URLs directly.
- SQL is interpolated from request parameters inside n8n workflows.
- The repo does not contain one canonical schema for the real production database.
- Ads logic has schema ambiguity around `ad_snapshots.ad_id`.
- Business logic is spread across workflow nodes instead of typed application code.
- Scraping, API, and UI contracts are not versioned together.

## 4. Recommended Architecture For Olympic Holiday

Build a typed full-stack TypeScript system with the same product shape and a cleaner runtime split.

### 4.1 Recommended stack

- Frontend + read API: Next.js on Vercel
- Database: PostgreSQL
- ORM/migrations: Drizzle ORM
- Background jobs / scrapers: Node.js worker service on Railway
- Scraping tools:
  - `fetch` / `axios` for JSON or simple HTML endpoints
  - `cheerio` for HTML parsing
  - `playwright` only for sites that require browser rendering
- LLM extraction: OpenAI structured outputs for homepage marketing offers
- Ads source: DataForSEO, same as the reference system
- Error monitoring: Sentry
- Logging: structured JSON logs plus a `job_runs` table

### 4.2 Why this split

- Vercel is good for the dashboard and typed API routes.
- Railway is better for scheduled workers, scraping, retries, and longer-running jobs.
- PostgreSQL stays the system of record.
- The UI and API live in the same codebase, so contracts stay aligned.
- The worker becomes plain code, not low-visibility workflow glue.

## 5. Proposed Repository Shape

```text
apps/
  web/                Next.js app, pages, API routes, auth
  worker/             scheduled jobs and scraper runners

packages/
  db/                 Drizzle schema and migrations
  core/               lifecycle logic, diffing, alert creation
  scrapers/           per-competitor adapters
  shared/             shared types and validation schemas

docs/
  architecture.md
  schema.md
  env.md
  runbook.md
```

## 6. Data Model To Implement

Use the reference schema as the product contract, but clean it up while rebuilding.

### 6.1 Reference / config tables

- `competitors`
- `destinations`
- `destination_keywords`

### 6.2 Ads domain

- `ads`
- `ad_snapshots`
- `ad_classifications`
- `ad_status`

### 6.3 Offers domain

- `offers`
- `offer_snapshots`
- `offer_classifications`
- `offer_status`
- `offer_changes`

### 6.4 Marketing domain

- `marketing_offers`
- `marketing_offer_events`

### 6.5 Shared operational tables

- `alerts`
- `job_runs`
- `job_errors`

### 6.6 Important design decision

For offers, do not copy the current `scraped_offers` table design exactly.

Instead:

- keep one canonical `offers` row per `(competitor_id, external_id)`
- store every scrape result in `offer_snapshots`
- calculate current status from the latest and previous snapshots

That gives cleaner history and makes debugging much easier.

## 7. Application Layers

### 7.1 `apps/web`

Responsibilities:

- render the same 4 pages as WWT
- expose internal API routes such as:
  - `GET /api/ads`
  - `GET /api/ads/summary`
  - `GET /api/offers`
  - `GET /api/offers/summary`
  - `GET /api/marketing-offers`
  - `GET /api/alerts`
  - `GET /api/competitors`
  - `GET /api/destinations`
- validate all query params with Zod
- optionally protect the dashboard behind auth

### 7.2 `apps/worker`

Responsibilities:

- run scheduled jobs
- execute per-competitor offer scrapers
- run the ads ingestion job
- run homepage marketing-offer extraction
- write snapshots, statuses, and alerts
- record each run in `job_runs`

### 7.3 `packages/core`

Responsibilities:

- determine status:
  - missing before, present now -> `new`
  - present before, different snapshot -> `changed`
  - present before, same snapshot -> `active`
  - present before, missing now -> `removed`
- age `new` and `changed` to `active` after the agreed window
- emit alerts only once per entity per status transition

## 8. Scraper Strategy

Do not build one giant generic scraper.

Use a shared interface plus competitor-specific adapters:

```ts
type OfferScraper = {
  competitor: string;
  fetchOffers(): Promise<NormalizedOfferInput[]>;
};
```

Each competitor module should decide whether it uses:

- public JSON/API endpoints
- server-rendered HTML parsing
- Playwright

This is the same logical pattern as the n8n build, but implemented in code instead of per-workflow node graphs.

## 9. Delivery Plan

### Phase 1. Foundation

- Set up monorepo
- Create PostgreSQL schema and migrations
- Build seed scripts for competitors and destinations
- Add typed internal API routes
- Port the WWT UI structure into the new app and replace hard-coded n8n endpoints with internal API calls

Deliverable:

- the Olympic Holiday dashboard loads with seeded data and the same navigation/page structure as WWT

### Phase 2. Marketing Offers First

- Implement homepage fetch + cleanup
- Use structured LLM extraction
- Normalize URLs and generate `source_key`
- Save new items and emit alerts
- Surface the data on the Marketing Offers and Notifications pages

Reason:

- this is the simplest vertical slice and validates the end-to-end architecture quickly

### Phase 3. Offers Pipeline

- Build the shared offer ingestion engine
- Implement one competitor scraper first
- Finalize snapshot diffing and lifecycle logic
- Add offer summary counts and filters
- Add alert generation
- Then add remaining competitors one by one

Reason:

- scraper complexity will vary a lot by competitor
- doing one adapter first prevents over-design

### Phase 4. Ads Pipeline

- Integrate DataForSEO
- Normalize creatives into `ads` + `ad_snapshots`
- Add keyword-based destination matching
- Add OCR only where DataForSEO payload lacks usable text
- Implement ads status transitions and summary counts

### Phase 5. Production Hardening

- auth if required
- Sentry
- retries and timeout handling
- admin run logs
- rate limiting on read APIs
- backup/restore process
- incident runbook

## 10. Recommended Build Order For Olympic Holiday

If the goal is to get visible progress fast:

1. Rebuild the frontend shell and internal API contract
2. Ship Marketing Offers
3. Ship Offers for 1 competitor
4. Add the remaining offer competitors
5. Ship Ads
6. Add admin/ops polish

This gets a working client-facing system much faster than trying to finish all scrapers before the UI exists.

## 11. What Can Be Reused From WWT

Safe to reuse conceptually or directly refactor:

- route structure
- filter UX
- card layouts
- summary cards
- notifications page shape

Do not reuse as-is:

- hard-coded endpoint layer
- n8n SQL endpoint logic
- direct browser access to public data endpoints
- implicit schema assumptions from the workflow exports

## 12. Immediate Next Actions

1. Confirm the final Olympic Holiday competitor list and clean canonical domains.
2. Confirm whether the dashboard should be public or behind login.
3. Confirm whether ads monitoring must be included in MVP or can land after offers.
4. Create the canonical schema and seed data.
5. Scaffold the new app and port the reference UI into internal API calls.
6. Implement the first vertical slice with Marketing Offers.

## 13. Recommended MVP Scope

For a first production version, I would define MVP as:

- same UI structure as WWT
- competitors and destinations filters
- marketing offers pipeline
- offers pipeline for at least 1 competitor
- notifications feed
- database-backed job history

Ads can be included in MVP only if DataForSEO access and required budget are already confirmed.

## 14. Risks To Resolve Early

- some competitor sites may require browser automation or anti-bot handling
- destination taxonomy for Olympic Holiday may differ from WWT and should not be copied blindly
- DataForSEO and OpenAI costs need to be budgeted before full rollout
- status rules must be agreed in writing before historical data starts accumulating

## 15. My Recommendation

Do not rebuild the current n8n structure one-for-one.

Instead:

- keep the same product and UI behaviour
- replace n8n with typed application code
- use Vercel for the web app
- use Railway for scheduled workers
- use PostgreSQL as the single source of truth

That gives you a system that is easier to debug, easier to host, easier to extend per competitor, and much safer than the current browser-to-n8n model.
