-- Olympic Holiday Monitor
-- Fresh PostgreSQL bootstrap script
--
-- Run from the repo root so the \copy paths resolve correctly:
--   psql "$DATABASE_URL" -f database/create_olympic_monitor_database.sql
--
-- This script:
-- 1. Drops the existing Olympic Monitor schema objects
-- 2. Recreates all enums, tables, foreign keys, and indexes
-- 3. Seeds competitors and competitor capabilities
-- 4. Imports destinations and keywords from railway.csv / railwayKeywords.csv

BEGIN;

DROP TABLE IF EXISTS job_errors CASCADE;
DROP TABLE IF EXISTS job_runs CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS marketing_offers CASCADE;
DROP TABLE IF EXISTS offer_classification CASCADE;
DROP TABLE IF EXISTS offer_changes CASCADE;
DROP TABLE IF EXISTS offer_status CASCADE;
DROP TABLE IF EXISTS scraped_offers CASCADE;
DROP TABLE IF EXISTS ai_classification CASCADE;
DROP TABLE IF EXISTS ad_status CASCADE;
DROP TABLE IF EXISTS ad_snapshots CASCADE;
DROP TABLE IF EXISTS ads CASCADE;
DROP TABLE IF EXISTS competitor_capabilities CASCADE;
DROP TABLE IF EXISTS keywords CASCADE;
DROP TABLE IF EXISTS destinations CASCADE;
DROP TABLE IF EXISTS competitors CASCADE;

DROP TYPE IF EXISTS job_status CASCADE;
DROP TYPE IF EXISTS job_type CASCADE;
DROP TYPE IF EXISTS alert_type CASCADE;
DROP TYPE IF EXISTS capability_state CASCADE;
DROP TYPE IF EXISTS capability_module CASCADE;
DROP TYPE IF EXISTS lifecycle_status CASCADE;

CREATE TYPE lifecycle_status AS ENUM ('new', 'active', 'removed', 'changed');
CREATE TYPE capability_module AS ENUM ('ads', 'offers', 'marketing');
CREATE TYPE capability_state AS ENUM ('enabled', 'in_progress', 'blocked');
CREATE TYPE alert_type AS ENUM ('new_offer', 'updated_offer', 'removed_offer');
CREATE TYPE job_type AS ENUM ('offers_sync', 'marketing_sync', 'ads_sync');
CREATE TYPE job_status AS ENUM ('running', 'success', 'partial', 'blocked', 'failed');

CREATE TABLE competitors (
  id serial PRIMARY KEY,
  slug varchar(100) NOT NULL,
  name varchar(255) NOT NULL,
  website_url varchar(500) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX competitors_slug_key ON competitors (slug);

CREATE TABLE destinations (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  country varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE keywords (
  id serial PRIMARY KEY,
  keyword varchar(255) NOT NULL,
  destination_id integer REFERENCES destinations(id),
  competitor_id integer REFERENCES competitors(id)
);

CREATE INDEX keywords_destination_id_idx ON keywords (destination_id);
CREATE INDEX keywords_competitor_id_idx ON keywords (competitor_id);
CREATE INDEX keywords_keyword_idx ON keywords (keyword);

CREATE TABLE competitor_capabilities (
  id serial PRIMARY KEY,
  competitor_id integer NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  module capability_module NOT NULL,
  state capability_state NOT NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX competitor_capabilities_competitor_module_key
  ON competitor_capabilities (competitor_id, module);

CREATE TABLE ads (
  id serial PRIMARY KEY,
  creative_id varchar(255) NOT NULL,
  competitor_id integer NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  advertiser_id varchar(255),
  media_format varchar(100),
  first_seen_global timestamptz,
  last_seen_global timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ads_creative_id_key ON ads (creative_id);
CREATE INDEX ads_competitor_id_idx ON ads (competitor_id);
CREATE INDEX ads_created_at_idx ON ads (created_at DESC);

CREATE TABLE ad_snapshots (
  id serial PRIMARY KEY,
  ad_id integer NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  regions jsonb,
  image jsonb,
  videos jsonb,
  metadata jsonb,
  snapshot_hash varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ad_snapshots_ad_snapshot_date_key
  ON ad_snapshots (ad_id, snapshot_date);
CREATE INDEX ad_snapshots_ad_created_at_idx ON ad_snapshots (ad_id, created_at DESC);
CREATE INDEX ad_snapshots_snapshot_date_idx ON ad_snapshots (snapshot_date DESC);

CREATE TABLE ad_status (
  id serial PRIMARY KEY,
  ad_id integer NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  status lifecycle_status NOT NULL,
  became_new_date date,
  became_removed_date date,
  changed_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ad_status_ad_id_key ON ad_status (ad_id);
CREATE INDEX ad_status_status_idx ON ad_status (status);
CREATE INDEX ad_status_updated_at_idx ON ad_status (updated_at DESC);

CREATE TABLE ai_classification (
  id serial PRIMARY KEY,
  ad_id integer NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  destination_id integer REFERENCES destinations(id),
  tour_type varchar(255),
  seasonality varchar(255),
  confidence_score double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_classification_ad_id_idx ON ai_classification (ad_id);
CREATE INDEX ai_classification_destination_id_idx ON ai_classification (destination_id);

CREATE TABLE scraped_offers (
  id serial PRIMARY KEY,
  competitor_id integer NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  external_id varchar(255) NOT NULL,
  offer_title varchar(500) NOT NULL,
  offer_url varchar(1000) NOT NULL,
  price_text varchar(255) NOT NULL,
  price_numeric varchar(64),
  currency varchar(32) NOT NULL,
  duration_days integer,
  departure_date date,
  image_url varchar(1000),
  description text,
  raw_data jsonb NOT NULL,
  scraped_date date NOT NULL,
  snapshot_hash varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX scraped_offers_competitor_external_id_key
  ON scraped_offers (competitor_id, external_id);
CREATE INDEX scraped_offers_competitor_created_at_idx
  ON scraped_offers (competitor_id, created_at DESC);
CREATE INDEX scraped_offers_scraped_date_idx ON scraped_offers (scraped_date DESC);

CREATE TABLE offer_status (
  id serial PRIMARY KEY,
  offer_id integer NOT NULL REFERENCES scraped_offers(id) ON DELETE CASCADE,
  status lifecycle_status NOT NULL,
  first_seen_date date,
  last_seen_date date,
  became_new_date date,
  became_removed_date date,
  changed_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX offer_status_offer_id_key ON offer_status (offer_id);
CREATE INDEX offer_status_status_idx ON offer_status (status);
CREATE INDEX offer_status_updated_at_idx ON offer_status (updated_at DESC);

CREATE TABLE offer_changes (
  id serial PRIMARY KEY,
  offer_id integer NOT NULL REFERENCES scraped_offers(id) ON DELETE CASCADE,
  change_type varchar(50) NOT NULL,
  change_date date NOT NULL,
  previous_snapshot jsonb,
  new_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX offer_changes_offer_id_change_date_idx
  ON offer_changes (offer_id, change_date DESC);

CREATE TABLE offer_classification (
  id serial PRIMARY KEY,
  offer_id integer NOT NULL REFERENCES scraped_offers(id) ON DELETE CASCADE,
  destination_id integer REFERENCES destinations(id),
  tour_type varchar(255),
  seasonality varchar(255),
  confidence_score double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX offer_classification_offer_id_key
  ON offer_classification (offer_id);
CREATE INDEX offer_classification_destination_id_idx
  ON offer_classification (destination_id);

CREATE TABLE marketing_offers (
  id serial PRIMARY KEY,
  competitor_id integer NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  source_key varchar(255) NOT NULL,
  title varchar(500) NOT NULL,
  description text,
  url varchar(1000),
  cta_text varchar(255),
  validity varchar(255),
  raw_text text,
  raw_data jsonb NOT NULL,
  snapshot_hash varchar(255) NOT NULL,
  detected_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX marketing_offers_competitor_source_key_key
  ON marketing_offers (competitor_id, source_key);
CREATE INDEX marketing_offers_competitor_detected_at_idx
  ON marketing_offers (competitor_id, detected_at DESC);

CREATE TABLE alerts (
  id serial PRIMARY KEY,
  ad_id integer REFERENCES ads(id) ON DELETE CASCADE,
  offer_id integer REFERENCES scraped_offers(id) ON DELETE CASCADE,
  marketing_offer_id integer REFERENCES marketing_offers(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX alerts_created_at_idx ON alerts (created_at DESC);
CREATE INDEX alerts_type_created_at_idx ON alerts (type, created_at DESC);
CREATE INDEX alerts_ad_id_idx ON alerts (ad_id);
CREATE INDEX alerts_offer_id_idx ON alerts (offer_id);
CREATE INDEX alerts_marketing_offer_id_idx ON alerts (marketing_offer_id);

CREATE TABLE job_runs (
  id serial PRIMARY KEY,
  run_id varchar(255) NOT NULL,
  job_type job_type NOT NULL,
  competitor_id integer REFERENCES competitors(id),
  status job_status NOT NULL,
  records_seen integer NOT NULL DEFAULT 0,
  records_changed integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_summary text
);

CREATE INDEX job_runs_run_id_idx ON job_runs (run_id);
CREATE INDEX job_runs_job_type_status_idx ON job_runs (job_type, status);
CREATE INDEX job_runs_competitor_id_idx ON job_runs (competitor_id);
CREATE INDEX job_runs_started_at_idx ON job_runs (started_at DESC);

CREATE TABLE job_errors (
  id serial PRIMARY KEY,
  job_run_id integer NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
  error_code varchar(100) NOT NULL,
  message text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_errors_job_run_id_idx ON job_errors (job_run_id);
CREATE INDEX job_errors_created_at_idx ON job_errors (created_at DESC);

INSERT INTO competitors (id, slug, name, website_url, created_at) VALUES
  (1, 'jet2-holidays', 'Jet2 Holidays', 'https://www.jet2holidays.com/', now()),
  (2, 'easyjet-holidays', 'easyJet Holidays', 'https://www.easyjet.com/en/holidays', now()),
  (3, 'tui', 'TUI', 'https://www.tui.co.uk/', now()),
  (4, 'sunvil', 'Sunvil', 'https://www.sunvil.co.uk/', now()),
  (5, 'ionian-island-holidays', 'Ionian Island Holidays', 'https://www.ionianislandholidays.com/', now()),
  (6, 'loveholidays', 'loveholidays', 'https://www.loveholidays.com/', now());

INSERT INTO competitor_capabilities (competitor_id, module, state, note) VALUES
  (1, 'offers', 'in_progress', 'Promotions working, live prices not stable yet.'),
  (1, 'marketing', 'enabled', 'Promotions extraction is working.'),
  (1, 'ads', 'enabled', 'Google Ads Transparency ingestion enabled via DataForSEO.'),
  (2, 'offers', 'enabled', 'Promotions and live prices working.'),
  (2, 'marketing', 'enabled', 'Promotions extraction is working.'),
  (2, 'ads', 'enabled', 'Google Ads Transparency ingestion enabled via DataForSEO.'),
  (3, 'offers', 'in_progress', 'Promotions working, live prices not stable yet.'),
  (3, 'marketing', 'enabled', 'Promotions extraction is working.'),
  (3, 'ads', 'enabled', 'Google Ads Transparency ingestion enabled via DataForSEO.'),
  (4, 'offers', 'enabled', 'Live prices working; promotions currently blocked.'),
  (4, 'marketing', 'blocked', 'Promotions currently blocked by challenge or selector gaps.'),
  (4, 'ads', 'enabled', 'Ads provider is live; Sunvil may simply have no current UK Google ads.'),
  (5, 'offers', 'enabled', 'Promotions and live prices working.'),
  (5, 'marketing', 'enabled', 'Promotions extraction is working.'),
  (5, 'ads', 'enabled', 'Google Ads Transparency ingestion enabled via DataForSEO.'),
  (6, 'offers', 'blocked', 'Blocked by captcha or anti-bot protection.'),
  (6, 'marketing', 'blocked', 'Blocked by captcha or anti-bot protection.'),
  (6, 'ads', 'enabled', 'Google Ads Transparency ingestion enabled via DataForSEO.');

COMMIT;

-- Import destinations and keywords from the attached CSV files.
-- Run this script from the repo root so these relative paths resolve.
\copy destinations (id, name, country, created_at) FROM './railway.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy keywords (id, keyword, destination_id, competitor_id) FROM './railwayKeywords.csv' WITH (FORMAT csv, HEADER true, NULL '');

-- Fix sequences after explicit ID imports.
SELECT setval(pg_get_serial_sequence('competitors', 'id'), COALESCE((SELECT MAX(id) FROM competitors), 1), true);
SELECT setval(pg_get_serial_sequence('destinations', 'id'), COALESCE((SELECT MAX(id) FROM destinations), 1), true);
SELECT setval(pg_get_serial_sequence('keywords', 'id'), COALESCE((SELECT MAX(id) FROM keywords), 1), true);
SELECT setval(pg_get_serial_sequence('competitor_capabilities', 'id'), COALESCE((SELECT MAX(id) FROM competitor_capabilities), 1), true);
SELECT setval(pg_get_serial_sequence('ads', 'id'), COALESCE((SELECT MAX(id) FROM ads), 1), true);
SELECT setval(pg_get_serial_sequence('ad_snapshots', 'id'), COALESCE((SELECT MAX(id) FROM ad_snapshots), 1), true);
SELECT setval(pg_get_serial_sequence('ad_status', 'id'), COALESCE((SELECT MAX(id) FROM ad_status), 1), true);
SELECT setval(pg_get_serial_sequence('ai_classification', 'id'), COALESCE((SELECT MAX(id) FROM ai_classification), 1), true);
SELECT setval(pg_get_serial_sequence('scraped_offers', 'id'), COALESCE((SELECT MAX(id) FROM scraped_offers), 1), true);
SELECT setval(pg_get_serial_sequence('offer_status', 'id'), COALESCE((SELECT MAX(id) FROM offer_status), 1), true);
SELECT setval(pg_get_serial_sequence('offer_changes', 'id'), COALESCE((SELECT MAX(id) FROM offer_changes), 1), true);
SELECT setval(pg_get_serial_sequence('offer_classification', 'id'), COALESCE((SELECT MAX(id) FROM offer_classification), 1), true);
SELECT setval(pg_get_serial_sequence('marketing_offers', 'id'), COALESCE((SELECT MAX(id) FROM marketing_offers), 1), true);
SELECT setval(pg_get_serial_sequence('alerts', 'id'), COALESCE((SELECT MAX(id) FROM alerts), 1), true);
SELECT setval(pg_get_serial_sequence('job_runs', 'id'), COALESCE((SELECT MAX(id) FROM job_runs), 1), true);
SELECT setval(pg_get_serial_sequence('job_errors', 'id'), COALESCE((SELECT MAX(id) FROM job_errors), 1), true);
