CREATE TYPE lifecycle_status AS ENUM ('new', 'active', 'removed', 'changed');
CREATE TYPE capability_module AS ENUM ('ads', 'offers', 'marketing');
CREATE TYPE capability_state AS ENUM ('enabled', 'in_progress', 'blocked');
CREATE TYPE alert_type AS ENUM ('new_offer', 'updated_offer', 'removed_offer');
CREATE TYPE job_type AS ENUM ('offers_sync', 'marketing_sync', 'ads_sync');
CREATE TYPE job_status AS ENUM ('running', 'success', 'partial', 'blocked', 'failed');

CREATE TABLE competitors (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  website_url VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE destinations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  country VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL,
  destination_id INTEGER REFERENCES destinations(id),
  competitor_id INTEGER REFERENCES competitors(id)
);

CREATE TABLE competitor_capabilities (
  id SERIAL PRIMARY KEY,
  competitor_id INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  module capability_module NOT NULL,
  state capability_state NOT NULL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (competitor_id, module)
);

CREATE TABLE ads (
  id SERIAL PRIMARY KEY,
  creative_id VARCHAR(255) NOT NULL UNIQUE,
  competitor_id INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  advertiser_id VARCHAR(255),
  media_format VARCHAR(100),
  first_seen_global TIMESTAMPTZ,
  last_seen_global TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ad_snapshots (
  id SERIAL PRIMARY KEY,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  regions JSONB,
  image JSONB,
  videos JSONB,
  metadata JSONB,
  snapshot_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_id, snapshot_date)
);

CREATE TABLE ad_status (
  id SERIAL PRIMARY KEY,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE UNIQUE,
  status lifecycle_status NOT NULL,
  became_new_date DATE,
  became_removed_date DATE,
  changed_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_classification (
  id SERIAL PRIMARY KEY,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  destination_id INTEGER REFERENCES destinations(id),
  tour_type VARCHAR(255),
  seasonality VARCHAR(255),
  confidence_score DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE scraped_offers (
  id SERIAL PRIMARY KEY,
  competitor_id INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  offer_title VARCHAR(500) NOT NULL,
  offer_url VARCHAR(1000) NOT NULL,
  price_text VARCHAR(255) NOT NULL,
  price_numeric VARCHAR(64),
  currency VARCHAR(32) NOT NULL,
  duration_days INTEGER,
  departure_date DATE,
  image_url VARCHAR(1000),
  description TEXT,
  raw_data JSONB NOT NULL,
  scraped_date DATE NOT NULL,
  snapshot_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (competitor_id, external_id)
);

CREATE TABLE offer_status (
  id SERIAL PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES scraped_offers(id) ON DELETE CASCADE UNIQUE,
  status lifecycle_status NOT NULL,
  first_seen_date DATE,
  last_seen_date DATE,
  became_new_date DATE,
  became_removed_date DATE,
  changed_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE offer_changes (
  id SERIAL PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES scraped_offers(id) ON DELETE CASCADE,
  change_type VARCHAR(50) NOT NULL,
  change_date DATE NOT NULL,
  previous_snapshot JSONB,
  new_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE offer_classification (
  id SERIAL PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES scraped_offers(id) ON DELETE CASCADE UNIQUE,
  destination_id INTEGER REFERENCES destinations(id),
  tour_type VARCHAR(255),
  seasonality VARCHAR(255),
  confidence_score DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE marketing_offers (
  id SERIAL PRIMARY KEY,
  competitor_id INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  source_key VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  url VARCHAR(1000),
  cta_text VARCHAR(255),
  validity VARCHAR(255),
  raw_text TEXT,
  raw_data JSONB NOT NULL,
  snapshot_hash VARCHAR(255) NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (competitor_id, source_key)
);

CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  ad_id INTEGER REFERENCES ads(id) ON DELETE CASCADE,
  offer_id INTEGER REFERENCES scraped_offers(id) ON DELETE CASCADE,
  marketing_offer_id INTEGER REFERENCES marketing_offers(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE job_runs (
  id SERIAL PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL,
  job_type job_type NOT NULL,
  competitor_id INTEGER REFERENCES competitors(id),
  status job_status NOT NULL,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_changed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_summary TEXT
);

CREATE TABLE job_errors (
  id SERIAL PRIMARY KEY,
  job_run_id INTEGER NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
  error_code VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
