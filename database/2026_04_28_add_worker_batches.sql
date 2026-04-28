-- Adds durable batch traceability for Railway worker cron runs.
-- Safe to run against an existing Olympic Monitor database.

BEGIN;

CREATE TABLE IF NOT EXISTS job_batches (
  id serial PRIMARY KEY,
  batch_run_id varchar(255) NOT NULL,
  status job_status NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS job_batches_batch_run_id_key
  ON job_batches (batch_run_id);
CREATE INDEX IF NOT EXISTS job_batches_status_started_at_idx
  ON job_batches (status, started_at DESC);
CREATE INDEX IF NOT EXISTS job_batches_started_at_idx
  ON job_batches (started_at DESC);

ALTER TABLE job_runs
  ADD COLUMN IF NOT EXISTS batch_run_id varchar(255);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_runs_batch_run_id_fkey'
  ) THEN
    ALTER TABLE job_runs
      ADD CONSTRAINT job_runs_batch_run_id_fkey
      FOREIGN KEY (batch_run_id)
      REFERENCES job_batches(batch_run_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS job_runs_batch_run_id_idx
  ON job_runs (batch_run_id);

COMMIT;
