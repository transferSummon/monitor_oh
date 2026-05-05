BEGIN;

ALTER TABLE destinations ADD COLUMN IF NOT EXISTS slug varchar(255);
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS parent_id integer REFERENCES destinations(id);
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS destination_type varchar(50) NOT NULL DEFAULT 'country';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS is_olympic boolean NOT NULL DEFAULT false;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS sort_order integer;

UPDATE destinations
SET slug = lower(trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))
WHERE slug IS NULL OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS destinations_country_slug_key
  ON destinations(country, slug)
  WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS ad_destinations (
  id serial PRIMARY KEY,
  ad_id integer NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  destination_id integer NOT NULL REFERENCES destinations(id),
  role varchar(32) NOT NULL CHECK (role IN ('primary', 'matched', 'rollup')),
  confidence_score double precision,
  source varchar(32) NOT NULL DEFAULT 'keyword',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_id, destination_id)
);

CREATE INDEX IF NOT EXISTS ad_destinations_destination_id_idx ON ad_destinations(destination_id);
CREATE INDEX IF NOT EXISTS ad_destinations_ad_id_idx ON ad_destinations(ad_id);

CREATE TABLE IF NOT EXISTS offer_destinations (
  id serial PRIMARY KEY,
  offer_id integer NOT NULL REFERENCES scraped_offers(id) ON DELETE CASCADE,
  destination_id integer NOT NULL REFERENCES destinations(id),
  role varchar(32) NOT NULL CHECK (role IN ('primary', 'matched', 'rollup')),
  confidence_score double precision,
  source varchar(32) NOT NULL DEFAULT 'keyword',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, destination_id)
);

CREATE INDEX IF NOT EXISTS offer_destinations_destination_id_idx ON offer_destinations(destination_id);
CREATE INDEX IF NOT EXISTS offer_destinations_offer_id_idx ON offer_destinations(offer_id);

INSERT INTO destinations (name, country, slug, parent_id, destination_type, is_olympic, sort_order, created_at)
VALUES ('Greece', 'Greece', 'greece', NULL, 'country', true, 100, NOW())
ON CONFLICT (country, slug) WHERE slug IS NOT NULL DO UPDATE
SET name = EXCLUDED.name,
    destination_type = EXCLUDED.destination_type,
    is_olympic = true,
    sort_order = EXCLUDED.sort_order;

WITH greece AS (
  SELECT id FROM destinations WHERE country = 'Greece' AND slug = 'greece'
),
greek_children(name, slug, destination_type, sort_order) AS (
  VALUES
    ('Aegina','aegina','island',101), ('Agistri','agistri','island',102),
    ('Alonissos','alonissos','island',103), ('Andros','andros','island',104),
    ('Antipaxos','antipaxos','island',105), ('Astypalaia','astypalaia','island',106),
    ('Athens','athens','city',107), ('Athens Riviera','athens-riviera','region',108),
    ('Corfu','corfu','island',109), ('Crete','crete','island',110),
    ('Evia','evia','island',111), ('Halki','halki','island',112),
    ('Halkidiki','halkidiki','region',113), ('Hydra','hydra','island',114),
    ('Ios','ios','island',115), ('Ithaca','ithaca','island',116),
    ('Kalymnos','kalymnos','island',117), ('Karpathos','karpathos','island',118),
    ('Kefalonia','kefalonia','island',119), ('Kos','kos','island',120),
    ('Lefkada','lefkada','island',121), ('Leros','leros','island',122),
    ('Milos','milos','island',123), ('Mykonos','mykonos','island',124),
    ('Naxos','naxos','island',125), ('North Peloponnese','north-peloponnese','region',126),
    ('Olympus Riviera','olympus-riviera','region',127), ('Parga','parga','region',128),
    ('Paros','paros','island',129), ('Patmos','patmos','island',130),
    ('Paxos','paxos','island',131), ('Pelion Peninsula','pelion-peninsula','region',132),
    ('Peloponnese','peloponnese','region',133), ('Poros','poros','island',134),
    ('Preveza','preveza','region',135), ('Rhodes','rhodes','island',136),
    ('Samos','samos','island',137), ('Santorini','santorini','island',138),
    ('Sifnos','sifnos','island',139), ('Sivota','sivota','region',140),
    ('Skiathos','skiathos','island',141), ('Skopelos','skopelos','island',142),
    ('Spetses','spetses','island',143), ('Symi','symi','island',144),
    ('Syros','syros','island',145), ('Thassos','thassos','island',146),
    ('Thessaloniki','thessaloniki','city',147), ('Tilos','tilos','island',148),
    ('Tinos','tinos','island',149), ('Zante','zante','island',150)
)
INSERT INTO destinations (name, country, slug, parent_id, destination_type, is_olympic, sort_order, created_at)
SELECT name, 'Greece', slug, (SELECT id FROM greece), destination_type, true, sort_order, NOW()
FROM greek_children
ON CONFLICT (country, slug) WHERE slug IS NOT NULL DO UPDATE
SET name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    destination_type = EXCLUDED.destination_type,
    is_olympic = true,
    sort_order = EXCLUDED.sort_order;

WITH olympic_top_level(slug, sort_order) AS (
  VALUES
    ('albania', 10), ('balearic-islands', 20), ('canary-islands', 30),
    ('croatia', 40), ('cyprus', 50), ('egypt', 60), ('greece', 100),
    ('india', 160), ('malta', 170), ('portugal', 180), ('spain', 190),
    ('the-gambia', 200), ('turkey', 210)
)
UPDATE destinations d
SET is_olympic = true,
    sort_order = COALESCE(d.sort_order, o.sort_order)
FROM olympic_top_level o
WHERE d.slug = o.slug
  AND d.parent_id IS NULL;

WITH keyword_aliases(keyword, dest_slug) AS (
  VALUES
    ('crete','crete'), ('chania','crete'), ('heraklion','crete'), ('rethymno','crete'), ('rethymnon','crete'),
    ('corfu','corfu'), ('rhodes','rhodes'), ('lindos','rhodes'), ('faliraki','rhodes'), ('ixia','rhodes'),
    ('kos','kos'), ('kardamena','kos'), ('tigaki','kos'),
    ('zante','zante'), ('zakynthos','zante'), ('tsilivi','zante'), ('laganas','zante'),
    ('kefalonia','kefalonia'), ('cephalonia','kefalonia'), ('skopelos','skopelos'),
    ('skiathos','skiathos'), ('santorini','santorini'), ('thira','santorini'),
    ('mykonos','mykonos'), ('naxos','naxos'), ('paros','paros'), ('paxos','paxos'),
    ('lefkada','lefkada'), ('lefkas','lefkada'), ('samos','samos'), ('halkidiki','halkidiki'),
    ('parga','parga'), ('preveza','preveza'), ('athens','athens'), ('athens riviera','athens-riviera'),
    ('thessaloniki','thessaloniki'), ('peloponnese','peloponnese'), ('north peloponnese','north-peloponnese'),
    ('sivota','sivota'), ('syvota','sivota'), ('pelion','pelion-peninsula'), ('pelion peninsula','pelion-peninsula')
),
resolved AS (
  SELECT ka.keyword, d.id AS destination_id
  FROM keyword_aliases ka
  JOIN destinations d ON d.country = 'Greece' AND d.slug = ka.dest_slug
)
UPDATE keywords k
SET destination_id = r.destination_id
FROM resolved r
JOIN destinations g ON g.country = 'Greece' AND g.slug = 'greece'
WHERE lower(k.keyword) = lower(r.keyword)
  AND k.destination_id = g.id;

WITH keyword_aliases(keyword, dest_slug) AS (
  VALUES
    ('aegina','aegina'), ('agistri','agistri'), ('alonissos','alonissos'), ('andros','andros'),
    ('antipaxos','antipaxos'), ('astypalaia','astypalaia'), ('evia','evia'), ('halki','halki'),
    ('hydra','hydra'), ('ios','ios'), ('ithaca','ithaca'), ('kalymnos','kalymnos'),
    ('karpathos','karpathos'), ('leros','leros'), ('milos','milos'), ('patmos','patmos'),
    ('poros','poros'), ('sifnos','sifnos'), ('spetses','spetses'), ('symi','symi'),
    ('syros','syros'), ('thassos','thassos'), ('tilos','tilos'), ('tinos','tinos'),
    ('crete holidays','crete'), ('corfu holidays','corfu'), ('rhodes holidays','rhodes'),
    ('kos holidays','kos'), ('zante holidays','zante'), ('santorini holidays','santorini'),
    ('mykonos holidays','mykonos'), ('skiathos holidays','skiathos')
)
INSERT INTO keywords (keyword, destination_id, competitor_id)
SELECT ka.keyword, d.id, NULL
FROM keyword_aliases ka
JOIN destinations d ON d.country = 'Greece' AND d.slug = ka.dest_slug
WHERE NOT EXISTS (
  SELECT 1
  FROM keywords k
  WHERE lower(k.keyword) = lower(ka.keyword)
    AND k.destination_id = d.id
    AND k.competitor_id IS NULL
);

INSERT INTO ad_destinations (ad_id, destination_id, role, confidence_score, source, created_at)
SELECT ad_id, destination_id, 'primary', confidence_score, 'legacy', created_at
FROM ai_classification
WHERE destination_id IS NOT NULL
ON CONFLICT (ad_id, destination_id) DO UPDATE
SET role = EXCLUDED.role,
    confidence_score = EXCLUDED.confidence_score,
    source = EXCLUDED.source,
    created_at = EXCLUDED.created_at;

INSERT INTO offer_destinations (offer_id, destination_id, role, confidence_score, source, created_at)
SELECT offer_id, destination_id, 'primary', confidence_score, 'legacy', created_at
FROM offer_classification
WHERE destination_id IS NOT NULL
ON CONFLICT (offer_id, destination_id) DO UPDATE
SET role = EXCLUDED.role,
    confidence_score = EXCLUDED.confidence_score,
    source = EXCLUDED.source,
    created_at = EXCLUDED.created_at;

SELECT setval(pg_get_serial_sequence('destinations', 'id'), COALESCE((SELECT MAX(id) FROM destinations), 1), true);
SELECT setval(pg_get_serial_sequence('keywords', 'id'), COALESCE((SELECT MAX(id) FROM keywords), 1), true);

COMMIT;
