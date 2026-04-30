import { createHash } from "node:crypto";

import type { CompetitorModule, JobRunRequest, JobRunResponse, JobRunStatus } from "@olympic/contracts";
import { competitorSeed, destinationSeed, getDb, hasDatabase, keywordSeed } from "@olympic/db";
import { sql } from "drizzle-orm";
import {
  ADAPTERS,
  runScrape,
  type CompetitorSlug,
  type LivePriceRecord,
  type PromotionRecord,
  type ScrapeRunResult,
} from "scraper-engine";

import { writeAdsArtifact } from "./ads/artifacts";
import { ADS_COMPETITOR_TARGETS, getAdsSettings } from "./ads/config";
import { fetchGoogleAdsByTarget } from "./ads/dataforseo";
import { extractTextFromImage, shutdownOcr } from "./ads/ocr";
import type { AdsArtifactResult, NormalizedAdRecord } from "./ads/types";
import { loadLocalEnv } from "./bootstrap-env";

loadLocalEnv();

type JobType = "offers_sync" | "marketing_sync" | "ads_sync";

export interface WorkerLogEvent {
  event: string;
  batchRunId?: string | null;
  module?: CompetitorModule | null;
  competitorSlug?: string | null;
  status?: JobRunStatus | "running" | null;
  durationMs?: number | null;
  recordsSeen?: number | null;
  recordsChanged?: number | null;
  runId?: string | null;
  errorCode?: string | null;
  message?: string | null;
}

export interface WorkerRunOptions {
  batchRunId?: string | null;
  logger?: (event: WorkerLogEvent) => void;
}

const MODULE_JOB_TYPES: Record<CompetitorModule, JobType> = {
  offers: "offers_sync",
  marketing: "marketing_sync",
  ads: "ads_sync",
};
const MARKETING_TITLE_MAX_LENGTH = 500;
const MARKETING_URL_MAX_LENGTH = 1000;
const MARKETING_SHORT_TEXT_MAX_LENGTH = 255;

let telemetrySchemaReady = false;

function createRunId(module: CompetitorModule, slug: string) {
  return `${module}-${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

export function createBatchRunId() {
  return `batch-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function getTimeoutMs(module: CompetitorModule) {
  const defaultValue = module === "ads" ? 12 * 60 * 1000 : 8 * 60 * 1000;
  const envName = module === "ads" ? "WORKER_ADS_TIMEOUT_MS" : "WORKER_SCRAPE_TIMEOUT_MS";
  const parsed = Number.parseInt(process.env[envName] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function toJobStatus(statuses: JobRunStatus[]) {
  if (statuses.length === 0) return "failed" satisfies JobRunStatus;
  if (statuses.every((status) => status === "success")) return "success" satisfies JobRunStatus;
  if (statuses.every((status) => status === "blocked")) return "blocked" satisfies JobRunStatus;
  if (statuses.every((status) => status === "failed")) return "failed" satisfies JobRunStatus;
  return "partial" satisfies JobRunStatus;
}

function emitWorkerLog(options: WorkerRunOptions | undefined, event: WorkerLogEvent) {
  options?.logger?.({
    batchRunId: options.batchRunId ?? null,
    ...event,
  });
}

class WorkerTimeoutError extends Error {
  readonly code = "timeout";

  constructor(message: string) {
    super(message);
    this.name = "WorkerTimeoutError";
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new WorkerTimeoutError(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function truncateForColumn(value: string | null | undefined, maxLength: number) {
  const text = (value ?? "").trim();

  if (!text) return null;
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);

  return `${text.slice(0, maxLength - 3)}...`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRawPreviewImage(metadata: Record<string, unknown> | null) {
  return asRecord(asRecord(metadata?.raw)?.preview_image);
}

function getPreviewImageUrl(image: unknown, metadata: Record<string, unknown> | null) {
  return asText(asRecord(image)?.url) ?? asText(getRawPreviewImage(metadata)?.url);
}

function getVideoPreviewUrl(videos: unknown, metadata: Record<string, unknown> | null) {
  const video = asRecord(videos);
  const raw = asRecord(metadata?.raw);
  return asText(video?.preview_url) ?? asText(video?.previewUrl) ?? asText(raw?.preview_url);
}

export interface StableAdSnapshotHashInput {
  advertiserId: string | null;
  advertiserTitle: string | null;
  creativeId: string | null;
  format: string | null;
  transparencyUrl: string | null;
  verified: boolean;
  previewImageUrl: string | null;
  previewImageHeight: number | null;
  previewImageWidth: number | null;
  previewUrl: string | null;
  target: string | null;
}

export interface StoredAdSnapshotHashInput {
  creativeId: string | null;
  advertiserId: string | null;
  mediaFormat: string | null;
  image: unknown;
  videos: unknown;
  metadata: unknown;
}

export function createStableAdSnapshotHash(input: StableAdSnapshotHashInput) {
  return hashValue(
    JSON.stringify({
      advertiserId: input.advertiserId,
      advertiserTitle: input.advertiserTitle,
      creativeId: input.creativeId,
      format: input.format,
      transparencyUrl: input.transparencyUrl,
      verified: input.verified,
      previewImageUrl: input.previewImageUrl,
      previewImageHeight: input.previewImageHeight,
      previewImageWidth: input.previewImageWidth,
      previewUrl: input.previewUrl,
      target: input.target,
    }),
  );
}

export function createStableAdSnapshotHashFromStored(input: StoredAdSnapshotHashInput) {
  const metadata = asRecord(input.metadata);
  const raw = asRecord(metadata?.raw);
  const image = asRecord(input.image);
  const rawPreviewImage = getRawPreviewImage(metadata);

  return createStableAdSnapshotHash({
    advertiserId: asText(input.advertiserId) ?? asText(raw?.advertiser_id),
    advertiserTitle: asText(metadata?.advertiser_title) ?? asText(raw?.title),
    creativeId: asText(input.creativeId) ?? asText(raw?.creative_id),
    format: asText(input.mediaFormat) ?? asText(raw?.format),
    transparencyUrl: asText(metadata?.transparency_url) ?? asText(raw?.url),
    verified: typeof metadata?.verified === "boolean" ? metadata.verified : Boolean(raw?.verified),
    previewImageUrl: asText(image?.url) ?? asText(rawPreviewImage?.url),
    previewImageHeight: asNumber(image?.height) ?? asNumber(rawPreviewImage?.height),
    previewImageWidth: asNumber(image?.width) ?? asNumber(rawPreviewImage?.width),
    previewUrl: getVideoPreviewUrl(input.videos, metadata),
    target: asText(metadata?.target),
  });
}

export function getAdPersistChangeType(input: {
  exists: boolean;
  previousStatus?: string | null;
  previousStableHash?: string | null;
  nextStableHash: string;
}) {
  if (!input.exists) return "new" as const;
  if (input.previousStatus === "removed") return "changed" as const;
  if ((input.previousStableHash ?? "") !== input.nextStableHash) return "changed" as const;
  return null;
}

export function getGoogleShownDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return todayDate(date);
}

export function isGoogleAdShownOnRunDate(lastShown: string | null | undefined, runDate: string) {
  const googleShownDate = getGoogleShownDate(lastShown);
  return !googleShownDate || googleShownDate >= runDate;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return todayDate(date);
}

function dateKeyOrNull(value: unknown) {
  if (value instanceof Date) return todayDate(value);

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return todayDate(parsed);
  }

  return null;
}

function isInsideLifecycleWindow(value: unknown, runDate: string) {
  const dateKey = dateKeyOrNull(value);
  return Boolean(dateKey && dateKey > addDays(runDate, -7));
}

export function getRestoredAdStatus(input: {
  becameNewDate: unknown;
  changedDate: unknown;
  runDate: string;
}) {
  if (isInsideLifecycleWindow(input.changedDate, input.runDate)) return "changed" as const;
  if (isInsideLifecycleWindow(input.becameNewDate, input.runDate)) return "new" as const;
  return "active" as const;
}

export function isConfirmedRemovedSnapshot(input: {
  becameRemovedDate: unknown;
  latestSnapshotDate: unknown;
  latestRawLastShown: unknown;
}) {
  const removedDate = dateKeyOrNull(input.becameRemovedDate);
  const snapshotDate = dateKeyOrNull(input.latestSnapshotDate);
  const lastShownDate = dateKeyOrNull(input.latestRawLastShown);

  return Boolean(removedDate && snapshotDate === removedDate && lastShownDate && lastShownDate < removedDate);
}

export function decideRemovedStatusRepair(input: {
  status: string | null;
  becameNewDate: unknown;
  changedDate: unknown;
  becameRemovedDate: unknown;
  latestSnapshotDate: unknown;
  latestRawLastShown: unknown;
  runDate: string;
}) {
  if (input.status !== "removed") return { action: "preserve", reason: "not_removed" } as const;
  if (
    isConfirmedRemovedSnapshot({
      becameRemovedDate: input.becameRemovedDate,
      latestSnapshotDate: input.latestSnapshotDate,
      latestRawLastShown: input.latestRawLastShown,
    })
  ) {
    return { action: "preserve", reason: "confirmed_removed" } as const;
  }

  return {
    action: "restore",
    status: getRestoredAdStatus({
      becameNewDate: input.becameNewDate,
      changedDate: input.changedDate,
      runDate: input.runDate,
    }),
  } as const;
}

export function getReturnedAdLifecycleAction(input: {
  exists: boolean;
  previousStatus?: string | null;
  previousStableHash?: string | null;
  nextStableHash: string;
  isCurrentlyShown: boolean;
}) {
  if (!input.exists) return input.isCurrentlyShown ? ("new" as const) : ("removed" as const);
  if (!input.isCurrentlyShown) return input.previousStatus === "removed" ? null : ("removed" as const);

  return getAdPersistChangeType({
    exists: true,
    previousStatus: input.previousStatus,
    previousStableHash: input.previousStableHash,
    nextStableHash: input.nextStableHash,
  });
}

export function decideAdStatusRepair(input: {
  status: string | null;
  becameRemovedDate: unknown;
  hasPreviousSnapshot: boolean;
  latestStableHash: string | null;
  previousStableHash: string | null;
  shouldBeNew: boolean;
}) {
  if (input.status !== "changed") return { action: "preserve", reason: "not_changed" } as const;
  if (input.becameRemovedDate) return { action: "preserve", reason: "reappeared_removed" } as const;
  if (!input.hasPreviousSnapshot) return { action: "preserve", reason: "no_previous_snapshot" } as const;
  if (!input.latestStableHash || !input.previousStableHash || input.latestStableHash !== input.previousStableHash) {
    return { action: "preserve", reason: "different_stable_hash" } as const;
  }

  return { action: "repair", status: input.shouldBeNew ? "new" : "active" } as const;
}

function buildAdClassificationText(input: {
  advertiserTitle?: string | null;
  target?: string | null;
  transparencyUrl?: string | null;
  previewUrl?: string | null;
  previewImageUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  image?: unknown;
  videos?: unknown;
  ocrText?: string | null;
}) {
  const metadata = input.metadata ?? null;
  const raw = asRecord(metadata?.raw);

  return [
    input.advertiserTitle,
    input.target,
    input.transparencyUrl,
    input.previewUrl,
    input.previewImageUrl,
    input.ocrText,
    asText(metadata?.advertiser_title),
    asText(metadata?.target),
    asText(metadata?.transparency_url),
    asText(metadata?.ocr_text),
    asText(raw?.title),
    asText(raw?.url),
    asText(raw?.preview_url),
    getPreviewImageUrl(input.image, metadata),
    getVideoPreviewUrl(input.videos, metadata),
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const params = new URLSearchParams(url.search);

    for (const key of [...params.keys()]) {
      if (key.startsWith("utm_") || key === "gclid" || key === "fbclid") {
        params.delete(key);
      }
    }

    url.search = params.toString();
    return url.toString();
  } catch {
    return value;
  }
}

export function matchDestinationId(text: string, competitorId: number) {
  const haystack = normalizeText(text);

  if (!haystack) return null;

  let best: { destinationId: number; score: number } | null = null;

  for (const keyword of keywordSeed) {
    if (keyword.competitorId && keyword.competitorId !== competitorId) continue;
    if (!keyword.destinationId) continue;

    const needle = normalizeText(keyword.keyword);
    if (!needle) continue;

    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(needle).replace(/\s+/g, "\\s+")}([^a-z0-9]|$)`, "g");
    const matches = [...haystack.matchAll(pattern)];
    if (matches.length === 0) continue;

    const score = matches.length * 100 + needle.length;

    if (!best || score > best.score) {
      best = {
        destinationId: keyword.destinationId,
        score,
      };
    }
  }

  return best?.destinationId ?? null;
}

function todayDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function dateKeyFromUnknown(value: unknown, fallback = new Date()) {
  return dateKeyOrNull(value) ?? todayDate(fallback);
}

function toIsoString(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

async function ensureWorkerTelemetrySchema() {
  if (telemetrySchemaReady || !hasDatabase()) return;

  const db = getDb();
  if (!db) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_batches (
      id serial PRIMARY KEY,
      batch_run_id varchar(255) NOT NULL,
      status job_status NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      summary jsonb
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS job_batches_batch_run_id_key
      ON job_batches (batch_run_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS job_batches_status_started_at_idx
      ON job_batches (status, started_at DESC)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS job_batches_started_at_idx
      ON job_batches (started_at DESC)
  `);

  await db.execute(sql`
    ALTER TABLE job_runs
      ADD COLUMN IF NOT EXISTS batch_run_id varchar(255)
  `);

  await db.execute(sql`
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
    END $$
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS job_runs_batch_run_id_idx
      ON job_runs (batch_run_id)
  `);

  telemetrySchemaReady = true;
}

export async function startJobBatch(batchRunId: string) {
  if (!hasDatabase()) return null;

  await ensureWorkerTelemetrySchema();

  const db = getDb();
  if (!db) return null;

  const rows = await db.execute(sql<{ id: number }>`
    INSERT INTO job_batches (batch_run_id, status, started_at, finished_at, summary)
    VALUES (${batchRunId}, 'running', NOW(), NULL, '{}'::jsonb)
    ON CONFLICT (batch_run_id) DO UPDATE
      SET status = 'running',
          started_at = EXCLUDED.started_at,
          finished_at = NULL,
          summary = EXCLUDED.summary
    RETURNING id
  `);

  return Number(rows[0]?.id ?? 0) || null;
}

export async function finishJobBatch(
  batchRunId: string,
  status: JobRunStatus,
  summary: Record<string, unknown>,
) {
  if (!hasDatabase()) return;

  await ensureWorkerTelemetrySchema();

  const db = getDb();
  if (!db) return;

  await db.execute(sql`
    UPDATE job_batches
    SET status = ${status},
        summary = ${JSON.stringify(summary)}::jsonb,
        finished_at = NOW()
    WHERE batch_run_id = ${batchRunId}
  `);
}

async function startJobRun(runId: string, jobType: JobType, competitorId: number | null, batchRunId?: string | null) {
  if (!hasDatabase()) return null;

  await ensureWorkerTelemetrySchema();

  const db = getDb();
  if (!db) return null;

  if (batchRunId) {
    await db.execute(sql`
      INSERT INTO job_batches (batch_run_id, status, started_at, summary)
      VALUES (${batchRunId}, 'running', NOW(), '{}'::jsonb)
      ON CONFLICT (batch_run_id) DO NOTHING
    `);
  }

  const rows = await db.execute(sql<{ id: number }>`
    INSERT INTO job_runs (run_id, batch_run_id, job_type, competitor_id, status, records_seen, records_changed, started_at)
    VALUES (${runId}, ${batchRunId ?? null}, ${jobType}, ${competitorId}, 'running', 0, 0, NOW())
    RETURNING id
  `);

  return Number(rows[0]?.id ?? 0) || null;
}

async function finishJobRun(
  jobRunId: number | null,
  status: "success" | "partial" | "blocked" | "failed",
  recordsSeen: number,
  recordsChanged: number,
  errorSummary: string | null,
) {
  if (!jobRunId || !hasDatabase()) return;

  const db = getDb();
  if (!db) return;

  await db.execute(sql`
    UPDATE job_runs
    SET status = ${status},
        records_seen = ${recordsSeen},
        records_changed = ${recordsChanged},
        error_summary = ${errorSummary},
        finished_at = NOW()
    WHERE id = ${jobRunId}
  `);
}

async function recordJobErrors(jobRunId: number | null, result: ScrapeRunResult) {
  if (!jobRunId || !hasDatabase() || result.blockers.length === 0) return;

  const db = getDb();
  if (!db) return;

  for (const blocker of result.blockers) {
    await db.execute(sql`
      INSERT INTO job_errors (job_run_id, error_code, message, details)
      VALUES (
        ${jobRunId},
        ${blocker.reason},
        ${blocker.message},
        ${JSON.stringify({ details: blocker.details ?? null })}::jsonb
      )
    `);
  }
}

async function recordJobError(
  jobRunId: number | null,
  errorCode: string,
  message: string,
  details?: Record<string, unknown>,
) {
  if (!jobRunId || !hasDatabase()) return;

  const db = getDb();
  if (!db) return;

  await db.execute(sql`
    INSERT INTO job_errors (job_run_id, error_code, message, details)
    VALUES (${jobRunId}, ${errorCode}, ${message}, ${JSON.stringify(details ?? null)}::jsonb)
  `);
}

export async function recordExternalJobFailure(input: {
  batchRunId: string;
  module: CompetitorModule;
  competitorSlug: string;
  errorCode: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  if (!hasDatabase()) return;

  await ensureWorkerTelemetrySchema();

  const db = getDb();
  if (!db) return;

  const competitor = competitorSeed.find((item) => item.slug === input.competitorSlug);
  const jobType = MODULE_JOB_TYPES[input.module];

  const updatedRows = await db.execute(sql<{ id: number }>`
    UPDATE job_runs
    SET status = 'failed',
        error_summary = ${input.message},
        finished_at = NOW()
    WHERE batch_run_id = ${input.batchRunId}
      AND job_type = ${jobType}
      AND competitor_id IS NOT DISTINCT FROM ${competitor?.id ?? null}
      AND status = 'running'
    RETURNING id
  `);

  let jobRunId = Number(updatedRows[0]?.id ?? 0) || null;

  if (!jobRunId) {
    jobRunId = await startJobRun(
      createRunId(input.module, input.competitorSlug),
      jobType,
      competitor?.id ?? null,
      input.batchRunId,
    );

    await finishJobRun(jobRunId, "failed", 0, 0, input.message);
  }

  await recordJobError(jobRunId, input.errorCode, input.message, input.details);
}

export async function inspectLatestBatch() {
  if (!hasDatabase()) {
    return {
      ok: false,
      message: "DATABASE_URL is not configured.",
    };
  }

  await ensureWorkerTelemetrySchema();

  const db = getDb();
  if (!db) {
    return {
      ok: false,
      message: "Database client could not be created.",
    };
  }

  const batches = await db.execute(sql<{
    id: number;
    batch_run_id: string;
    status: JobRunStatus;
    started_at: Date | string;
    finished_at: Date | string | null;
    summary: unknown;
  }>`
    SELECT id, batch_run_id, status, started_at, finished_at, summary
    FROM job_batches
    ORDER BY started_at DESC
    LIMIT 1
  `);

  const batch = batches[0];

  if (!batch) {
    return {
      ok: true,
      message: "No worker batches found.",
      batch: null,
      runs: [],
      errors: [],
    };
  }

  const runs = await db.execute(sql`
    SELECT
      jr.id,
      jr.run_id,
      jr.job_type,
      jr.status,
      jr.records_seen,
      jr.records_changed,
      jr.started_at,
      jr.finished_at,
      jr.error_summary,
      c.slug AS competitor_slug,
      c.name AS competitor_name
    FROM job_runs jr
    LEFT JOIN competitors c ON c.id = jr.competitor_id
    WHERE jr.batch_run_id = ${batch.batch_run_id}
    ORDER BY jr.started_at ASC
  `);

  const errors = await db.execute(sql`
    SELECT
      je.id,
      je.error_code,
      je.message,
      je.details,
      je.created_at,
      jr.run_id,
      jr.job_type,
      c.slug AS competitor_slug,
      c.name AS competitor_name
    FROM job_errors je
    INNER JOIN job_runs jr ON jr.id = je.job_run_id
    LEFT JOIN competitors c ON c.id = jr.competitor_id
    WHERE jr.batch_run_id = ${batch.batch_run_id}
    ORDER BY je.created_at DESC
    LIMIT 100
  `);

  return {
    ok: true,
    batch,
    runs,
    errors,
  };
}

async function maybeInsertAlert(
  offerId: number | null,
  marketingOfferId: number | null,
  type: "new_offer" | "updated_offer" | "removed_offer",
  message: string,
) {
  if (!hasDatabase()) return;

  const db = getDb();
  if (!db) return;

  const date = todayDate();
  const rows = await db.execute(sql<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM alerts
    WHERE offer_id IS NOT DISTINCT FROM ${offerId}
      AND marketing_offer_id IS NOT DISTINCT FROM ${marketingOfferId}
      AND type = ${type}
      AND created_at::date = ${date}::date
  `);

  if (Number(rows[0]?.count ?? 0) > 0) return;

  await db.execute(sql`
    INSERT INTO alerts (offer_id, marketing_offer_id, type, message, created_at)
    VALUES (${offerId}, ${marketingOfferId}, ${type}, ${message}, NOW())
  `);
}

async function persistOfferRecord(result: ScrapeRunResult, competitorId: number, record: LivePriceRecord) {
  const db = getDb();
  if (!db) {
    return { offerId: null, changeType: null as string | null };
  }

  const runDate = todayDate(new Date(result.finishedAt));
  const canonicalUrl = normalizeUrl(record.sourceUrl ?? record.evidence.finalUrl) ?? competitorSeed.find((item) => item.id === competitorId)?.websiteUrl ?? "";
  const externalId = hashValue(
    [
      competitorId,
      normalizeText(record.propertyName),
      canonicalUrl,
      normalizeText(record.travelDate),
      normalizeText(record.nights),
    ].join("|"),
  );
  const snapshotHash = hashValue(
    JSON.stringify({
      propertyName: record.propertyName,
      destination: record.destination,
      travelDate: record.travelDate,
      nights: record.nights,
      boardBasis: record.boardBasis,
      priceText: record.priceText,
      currency: record.currency,
      sourceUrl: canonicalUrl,
      imageUrl: record.imageUrl ?? null,
    }),
  );
  const destinationId = matchDestinationId(
    [record.destination, record.propertyName, canonicalUrl].filter(Boolean).join(" "),
    competitorId,
  );

  const existing = await db.execute(sql<{
    id: number;
    snapshot_hash: string;
    status: string | null;
  }>`
    SELECT o.id, o.snapshot_hash, s.status
    FROM scraped_offers o
    LEFT JOIN offer_status s ON s.offer_id = o.id
    WHERE o.competitor_id = ${competitorId}
      AND o.external_id = ${externalId}
    LIMIT 1
  `);

  const rawData = JSON.stringify(record);
  const priceNumeric = record.priceText?.replace(/[^\d.]/g, "") || null;
  const durationDays = record.nights ? Number.parseInt(record.nights.replace(/[^\d]/g, ""), 10) || null : null;
  const departureDate = record.travelDate ? todayDate(new Date(record.travelDate)) : null;

  if (existing.length === 0) {
    const inserted = await db.execute(sql<{ id: number }>`
      INSERT INTO scraped_offers (
        competitor_id, external_id, offer_title, offer_url, price_text, price_numeric, currency,
        duration_days, departure_date, image_url, description, raw_data, scraped_date, snapshot_hash, created_at
      )
      VALUES (
        ${competitorId},
        ${externalId},
        ${record.propertyName},
        ${canonicalUrl},
        ${record.priceText ?? ""},
        ${priceNumeric},
        ${record.currency ?? "GBP"},
        ${durationDays},
        ${departureDate},
        ${record.imageUrl ?? null},
        ${record.boardBasis ?? null},
        ${rawData}::jsonb,
        ${runDate},
        ${snapshotHash},
        ${result.finishedAt}
      )
      RETURNING id
    `);
    const offerId = Number(inserted[0]?.id ?? 0);

    await db.execute(sql`
      INSERT INTO offer_status (offer_id, status, first_seen_date, last_seen_date, became_new_date, updated_at)
      VALUES (${offerId}, 'new', ${runDate}, ${runDate}, ${runDate}, NOW())
    `);
    await db.execute(sql`
      INSERT INTO offer_changes (offer_id, change_type, change_date, previous_snapshot, new_snapshot, created_at)
      VALUES (${offerId}, 'new', ${runDate}, NULL, ${rawData}::jsonb, NOW())
    `);
    await db.execute(sql`
      INSERT INTO offer_classification (offer_id, destination_id, confidence_score, created_at)
      VALUES (${offerId}, ${destinationId}, ${destinationId ? 0.8 : null}, NOW())
      ON CONFLICT (offer_id) DO UPDATE
      SET destination_id = EXCLUDED.destination_id,
          confidence_score = EXCLUDED.confidence_score,
          created_at = NOW()
    `);
    await maybeInsertAlert(offerId, null, "new_offer", `New live-price offer detected for ${record.propertyName}.`);

    return { offerId, changeType: "new" as const };
  }

  const offerId = Number(existing[0]?.id ?? 0);
  const previousSnapshotHash = String(existing[0]?.snapshot_hash ?? "");
  const previousStatus = String(existing[0]?.status ?? "active");
  const changed = previousSnapshotHash !== snapshotHash || previousStatus === "removed";

  await db.execute(sql`
    UPDATE scraped_offers
    SET offer_title = ${record.propertyName},
        offer_url = ${canonicalUrl},
        price_text = ${record.priceText ?? ""},
        price_numeric = ${priceNumeric},
        currency = ${record.currency ?? "GBP"},
        duration_days = ${durationDays},
        departure_date = ${departureDate},
        image_url = ${record.imageUrl ?? null},
        description = ${record.boardBasis ?? null},
        raw_data = ${rawData}::jsonb,
        scraped_date = ${runDate},
        snapshot_hash = ${snapshotHash}
    WHERE id = ${offerId}
  `);
  await db.execute(sql`
    INSERT INTO offer_classification (offer_id, destination_id, confidence_score, created_at)
    VALUES (${offerId}, ${destinationId}, ${destinationId ? 0.8 : null}, NOW())
    ON CONFLICT (offer_id) DO UPDATE
    SET destination_id = EXCLUDED.destination_id,
        confidence_score = EXCLUDED.confidence_score,
        created_at = NOW()
  `);

  if (changed) {
    await db.execute(sql`
      UPDATE offer_status
      SET status = 'changed',
          last_seen_date = ${runDate},
          changed_date = ${runDate},
          updated_at = NOW()
      WHERE offer_id = ${offerId}
    `);
    await db.execute(sql`
      INSERT INTO offer_changes (offer_id, change_type, change_date, previous_snapshot, new_snapshot, created_at)
      VALUES (${offerId}, 'updated', ${runDate}, ${JSON.stringify({ snapshotHash: previousSnapshotHash })}::jsonb, ${rawData}::jsonb, NOW())
    `);
    await maybeInsertAlert(offerId, null, "updated_offer", `Live-price offer changed for ${record.propertyName}.`);
    return { offerId, changeType: "updated" as const };
  }

  await db.execute(sql`
    UPDATE offer_status
    SET last_seen_date = ${runDate},
        updated_at = NOW()
    WHERE offer_id = ${offerId}
  `);

  return { offerId, changeType: null };
}

async function markRemovedOffers(competitorId: number, seenOfferIds: number[]) {
  if (!hasDatabase() || seenOfferIds.length === 0) return 0;

  const db = getDb();
  if (!db) return 0;

  const date = todayDate();
  const rows = await db.execute(sql<{ offer_id: number; offer_title: string }>`
    SELECT o.id AS offer_id, o.offer_title
    FROM scraped_offers o
    LEFT JOIN offer_status s ON s.offer_id = o.id
    WHERE o.competitor_id = ${competitorId}
      AND COALESCE(s.status, 'active') <> 'removed'
  `);

  const removableRows = rows.filter((row) => !seenOfferIds.includes(Number(row.offer_id)));

  for (const row of removableRows) {
    const offerId = Number(row.offer_id);
    await db.execute(sql`
      UPDATE offer_status
      SET status = 'removed',
          became_removed_date = ${date},
          updated_at = NOW()
      WHERE offer_id = ${offerId}
    `);
    await db.execute(sql`
      INSERT INTO offer_changes (offer_id, change_type, change_date, previous_snapshot, new_snapshot, created_at)
      VALUES (${offerId}, 'removed', ${date}, NULL, NULL, NOW())
    `);
    await maybeInsertAlert(offerId, null, "removed_offer", `Live-price offer removed for ${row.offer_title}.`);
  }

  return removableRows.length;
}

async function ageOfferStatuses() {
  if (!hasDatabase()) return;

  const db = getDb();
  if (!db) return;

  await db.execute(sql`
    UPDATE offer_status
    SET status = 'active',
        updated_at = NOW()
    WHERE status IN ('new', 'changed')
      AND COALESCE(changed_date, became_new_date, first_seen_date) <= CURRENT_DATE - INTERVAL '7 days'
  `);
}

async function persistMarketingRecord(result: ScrapeRunResult, competitorId: number, record: PromotionRecord) {
  const db = getDb();
  if (!db) {
    return { inserted: false };
  }

  const canonicalUrl = normalizeUrl(record.sourceUrl ?? record.evidence.finalUrl);
  const rawText = buildMarketingRawText(record);
  const sourceKey = hashValue([competitorId, canonicalUrl, normalizeText(record.title)].join("|"));
  const title = truncateForColumn(record.title, MARKETING_TITLE_MAX_LENGTH) ?? "Untitled marketing offer";
  const url = truncateForColumn(canonicalUrl, MARKETING_URL_MAX_LENGTH);
  const ctaText = truncateForColumn(record.discountText, MARKETING_SHORT_TEXT_MAX_LENGTH);
  const validity = truncateForColumn(record.validityText ?? record.priceText, MARKETING_SHORT_TEXT_MAX_LENGTH);
  const snapshotHash = hashValue(
    JSON.stringify({
      title: record.title,
      subtitle: record.subtitle,
      priceText: record.priceText,
      discountText: record.discountText,
      destinationText: record.destinationText,
      imageUrl: record.imageUrl ?? null,
      offerType: record.offerType ?? null,
      promoCode: record.promoCode ?? null,
      validityText: record.validityText ?? null,
      sourceUrl: canonicalUrl,
    }),
  );
  const rawData = JSON.stringify(record);

  const existing = await db.execute(sql<{ id: number; snapshot_hash: string }>`
    SELECT id, snapshot_hash
    FROM marketing_offers
    WHERE competitor_id = ${competitorId}
      AND source_key = ${sourceKey}
    LIMIT 1
  `);

  if (existing.length === 0) {
    const inserted = await db.execute(sql<{ id: number }>`
      INSERT INTO marketing_offers (
        competitor_id, source_key, title, description, url, cta_text, validity,
        raw_text, raw_data, snapshot_hash, detected_at, created_at
      )
      VALUES (
        ${competitorId},
        ${sourceKey},
        ${title},
        ${record.subtitle ?? null},
        ${url},
        ${ctaText},
        ${validity},
        ${rawText},
        ${rawData}::jsonb,
        ${snapshotHash},
        ${result.finishedAt},
        NOW()
      )
      RETURNING id
    `);
    const marketingOfferId = Number(inserted[0]?.id ?? 0);
    await maybeInsertAlert(null, marketingOfferId, "new_offer", `New marketing offer detected for ${record.title}.`);
    return { inserted: true };
  }

  if (String(existing[0]?.snapshot_hash ?? "") !== snapshotHash) {
    await db.execute(sql`
      UPDATE marketing_offers
      SET title = ${title},
          description = ${record.subtitle ?? null},
          url = ${url},
          cta_text = ${ctaText},
          validity = ${validity},
          raw_text = ${rawText},
          raw_data = ${rawData}::jsonb,
          snapshot_hash = ${snapshotHash},
          detected_at = ${result.finishedAt}
      WHERE id = ${Number(existing[0]?.id)}
    `);
  }

  return { inserted: false };
}

function buildMarketingRawText(record: PromotionRecord) {
  return (
    [
      record.title,
      record.subtitle,
      record.priceText,
      record.discountText,
      record.destinationText,
      record.offerType,
      record.promoCode,
      record.validityText,
    ]
      .filter(Boolean)
      .join(" ") || null
  );
}

async function runOffersJob(competitorSlug?: string, options?: WorkerRunOptions): Promise<JobRunResponse> {
  const slugs = competitorSlug ? [competitorSlug as CompetitorSlug] : competitorSeed.map((item) => item.slug as CompetitorSlug);
  let totalSeen = 0;
  let totalChanged = 0;
  const messages: string[] = [];
  const runIds = new Set<string>();
  const statuses: JobRunStatus[] = [];
  const timeoutMs = getTimeoutMs("offers");

  for (const slug of slugs) {
    const competitor = competitorSeed.find((item) => item.slug === slug);
    if (!competitor) {
      throw new Error(`Unknown competitor: ${slug}`);
    }

    const startedAt = Date.now();
    const runId = createRunId("offers", slug);
    const jobRunId = await startJobRun(runId, "offers_sync", competitor.id, options?.batchRunId);

    emitWorkerLog(options, {
      event: "competitor.started",
      module: "offers",
      competitorSlug: slug,
      status: "running",
      runId,
      message: `${competitor.name} offers started.`,
    });

    try {
      const result = await withTimeout(
        runScrape({
          competitor: slug,
          capability: "live-prices",
          adapters: ADAPTERS,
        }),
        timeoutMs,
        `${competitor.name} offers timed out after ${timeoutMs}ms.`,
      );

      runIds.add(result.runId);
      totalSeen += result.records.length;
      await recordJobErrors(jobRunId, result);

      let changedForCompetitor = 0;

      if (hasDatabase() && result.records.length > 0) {
        const seenIds: number[] = [];

        for (const record of result.records) {
          if (record.kind !== "live-price") continue;

          const persisted = await persistOfferRecord(result, competitor.id, record);
          if (persisted.offerId) {
            seenIds.push(persisted.offerId);
          }
          if (persisted.changeType) {
            changedForCompetitor += 1;
          }
        }

        if (result.status === "success") {
          changedForCompetitor += await markRemovedOffers(competitor.id, seenIds);
        }

        await ageOfferStatuses();
      }

      totalChanged += changedForCompetitor;
      statuses.push(result.status);

      await finishJobRun(
        jobRunId,
        result.status,
        result.records.length,
        changedForCompetitor,
        result.blockers.map((item) => item.message).join(" ") || null,
      );

      messages.push(`${competitor.name}: ${result.status} (${result.records.length} records)`);
      emitWorkerLog(options, {
        event: "competitor.finished",
        module: "offers",
        competitorSlug: slug,
        status: result.status,
        durationMs: Date.now() - startedAt,
        recordsSeen: result.records.length,
        recordsChanged: changedForCompetitor,
        runId,
        message: `${competitor.name} offers ${result.status}.`,
      });
    } catch (error) {
      const errorCode = error instanceof WorkerTimeoutError ? error.code : "worker_error";
      const message = error instanceof Error ? error.message : "Unknown offers worker error.";

      statuses.push("failed");
      messages.push(`${competitor.name}: failed (${message})`);

      await recordJobError(jobRunId, errorCode, message, {
        competitorSlug: slug,
        module: "offers",
      });
      await finishJobRun(jobRunId, "failed", 0, 0, message);

      emitWorkerLog(options, {
        event: "competitor.failed",
        module: "offers",
        competitorSlug: slug,
        status: "failed",
        durationMs: Date.now() - startedAt,
        recordsSeen: 0,
        recordsChanged: 0,
        runId,
        errorCode,
        message,
      });
    }
  }

  const status = toJobStatus(statuses);

  return {
    ok: status !== "failed",
    module: "offers",
    status,
    competitorSlug: competitorSlug ?? null,
    message: hasDatabase()
      ? `Offers sync finished. ${messages.join(" | ")}`
      : `Offers scrape finished in artifact-only mode. ${messages.join(" | ")}`,
    runId: [...runIds][0] ?? null,
    counts: {
      recordsSeen: totalSeen,
      recordsChanged: totalChanged,
      competitorsProcessed: slugs.length,
    },
  };
}

async function runMarketingJob(competitorSlug?: string, options?: WorkerRunOptions): Promise<JobRunResponse> {
  const slugs = competitorSlug ? [competitorSlug as CompetitorSlug] : competitorSeed.map((item) => item.slug as CompetitorSlug);
  let totalSeen = 0;
  let totalInserted = 0;
  const messages: string[] = [];
  const runIds = new Set<string>();
  const statuses: JobRunStatus[] = [];
  const timeoutMs = getTimeoutMs("marketing");

  for (const slug of slugs) {
    const competitor = competitorSeed.find((item) => item.slug === slug);
    if (!competitor) {
      throw new Error(`Unknown competitor: ${slug}`);
    }

    const startedAt = Date.now();
    const runId = createRunId("marketing", slug);
    const jobRunId = await startJobRun(runId, "marketing_sync", competitor.id, options?.batchRunId);

    emitWorkerLog(options, {
      event: "competitor.started",
      module: "marketing",
      competitorSlug: slug,
      status: "running",
      runId,
      message: `${competitor.name} marketing started.`,
    });

    try {
      const result = await withTimeout(
        runScrape({
          competitor: slug,
          capability: "promotions",
          adapters: ADAPTERS,
        }),
        timeoutMs,
        `${competitor.name} marketing timed out after ${timeoutMs}ms.`,
      );

      runIds.add(result.runId);
      totalSeen += result.records.length;
      await recordJobErrors(jobRunId, result);

      let insertedCount = 0;

      if (hasDatabase() && result.records.length > 0) {
        for (const record of result.records) {
          if (record.kind !== "promotion") continue;
          const persisted = await persistMarketingRecord(result, competitor.id, record);
          if (persisted.inserted) {
            insertedCount += 1;
          }
        }
      }

      totalInserted += insertedCount;
      statuses.push(result.status);

      await finishJobRun(
        jobRunId,
        result.status,
        result.records.length,
        insertedCount,
        result.blockers.map((item) => item.message).join(" ") || null,
      );

      messages.push(`${competitor.name}: ${result.status} (${result.records.length} records)`);
      emitWorkerLog(options, {
        event: "competitor.finished",
        module: "marketing",
        competitorSlug: slug,
        status: result.status,
        durationMs: Date.now() - startedAt,
        recordsSeen: result.records.length,
        recordsChanged: insertedCount,
        runId,
        message: `${competitor.name} marketing ${result.status}.`,
      });
    } catch (error) {
      const errorCode = error instanceof WorkerTimeoutError ? error.code : "worker_error";
      const message = error instanceof Error ? error.message : "Unknown marketing worker error.";

      statuses.push("failed");
      messages.push(`${competitor.name}: failed (${message})`);

      await recordJobError(jobRunId, errorCode, message, {
        competitorSlug: slug,
        module: "marketing",
      });
      await finishJobRun(jobRunId, "failed", 0, 0, message);

      emitWorkerLog(options, {
        event: "competitor.failed",
        module: "marketing",
        competitorSlug: slug,
        status: "failed",
        durationMs: Date.now() - startedAt,
        recordsSeen: 0,
        recordsChanged: 0,
        runId,
        errorCode,
        message,
      });
    }
  }

  const status = toJobStatus(statuses);

  return {
    ok: status !== "failed",
    module: "marketing",
    status,
    competitorSlug: competitorSlug ?? null,
    message: hasDatabase()
      ? `Marketing sync finished. ${messages.join(" | ")}`
      : `Marketing scrape finished in artifact-only mode. ${messages.join(" | ")}`,
    runId: [...runIds][0] ?? null,
    counts: {
      recordsSeen: totalSeen,
      recordsChanged: totalInserted,
      competitorsProcessed: slugs.length,
    },
  };
}

function dedupeAds<T extends { creativeId: string; lastShown: string | null }>(records: T[]) {
  const map = new Map<string, T>();

  for (const record of records) {
    const existing = map.get(record.creativeId);

    if (!existing) {
      map.set(record.creativeId, record);
      continue;
    }

    const existingLastShown = existing.lastShown ? new Date(existing.lastShown).getTime() : 0;
    const candidateLastShown = record.lastShown ? new Date(record.lastShown).getTime() : 0;

    if (candidateLastShown >= existingLastShown) {
      map.set(record.creativeId, record);
    }
  }

  return [...map.values()];
}

async function enrichAdsWithClassification(
  competitorId: number,
  records: Array<{
    target: string;
    advertiserId: string;
    advertiserTitle: string;
    creativeId: string;
    transparencyUrl: string;
    verified: boolean;
    format: string;
    previewImageUrl: string | null;
    previewImageHeight: number | null;
    previewImageWidth: number | null;
    previewUrl: string | null;
    firstShown: string | null;
    lastShown: string | null;
    rawData: Record<string, unknown>;
  }>,
) {
  const competitor = competitorSeed.find((item) => item.id === competitorId);
  if (!competitor) return [];

  const settings = getAdsSettings();
  const normalized: NormalizedAdRecord[] = [];
  let ocrCount = 0;

  for (const record of records) {
    const baseText = buildAdClassificationText({
      advertiserTitle: record.advertiserTitle,
      target: record.target,
      transparencyUrl: record.transparencyUrl,
      previewUrl: record.previewUrl,
      previewImageUrl: record.previewImageUrl,
    });

    let ocrText: string | null = null;
    let ocrAttempted = false;
    let ocrError: string | null = null;
    const ocrSourceUrl = record.previewImageUrl;
    let destinationId = matchDestinationId(baseText, competitorId);
    let confidenceScore = destinationId ? 0.45 : null;
    const hasOcrCapacity = settings.ocrMaxPerCompetitor <= 0 || ocrCount < settings.ocrMaxPerCompetitor;

    if (
      settings.ocrEnabled &&
      !destinationId &&
      record.previewImageUrl &&
      hasOcrCapacity
    ) {
      ocrCount += 1;
      ocrAttempted = true;

      try {
        ocrText = await extractTextFromImage(record.previewImageUrl, `${record.creativeId}:${record.previewImageUrl}`);
        if (!ocrText) {
          ocrError = "no_text_detected";
        }
      } catch (error) {
        ocrText = null;
        ocrError = error instanceof Error ? error.message : "Unknown OCR error.";
      }

      const classifiedFromOcr = matchDestinationId([baseText, ocrText].filter(Boolean).join(" "), competitorId);
      if (classifiedFromOcr) {
        destinationId = classifiedFromOcr;
        confidenceScore = 0.82;
      }
    }

    const destination = destinationId ? destinationSeed.find((item) => item.id === destinationId) ?? null : null;
    const snapshotHash = createStableAdSnapshotHash({
      advertiserId: record.advertiserId,
      advertiserTitle: record.advertiserTitle,
      creativeId: record.creativeId,
      format: record.format,
      transparencyUrl: record.transparencyUrl,
      verified: record.verified,
      previewImageUrl: record.previewImageUrl,
      previewImageHeight: record.previewImageHeight,
      previewImageWidth: record.previewImageWidth,
      previewUrl: record.previewUrl,
      target: record.target,
    });

    normalized.push({
      competitorSlug: competitor.slug as CompetitorSlug,
      competitorName: competitor.name,
      competitorId,
      target: record.target,
      advertiserId: record.advertiserId,
      advertiserTitle: record.advertiserTitle,
      creativeId: record.creativeId,
      transparencyUrl: record.transparencyUrl,
      verified: record.verified,
      format: record.format,
      previewImageUrl: record.previewImageUrl,
      previewImageHeight: record.previewImageHeight,
      previewImageWidth: record.previewImageWidth,
      previewUrl: record.previewUrl,
      firstShown: record.firstShown,
      lastShown: record.lastShown,
      ocrText,
      ocrAttempted,
      ocrSourceUrl,
      ocrError,
      destinationId,
      destinationName: destination?.name ?? null,
      destinationCountry: destination?.country ?? null,
      confidenceScore,
      snapshotHash,
      rawData: record.rawData,
    });
  }

  return normalized;
}

async function upsertAdClassification(
  adId: number,
  destinationId: number | null,
  confidenceScore: number | null,
) {
  if (!hasDatabase()) return;

  const db = getDb();
  if (!db) return;

  const existing = await db.execute(sql<{ id: number }>`
    SELECT id
    FROM ai_classification
    WHERE ad_id = ${adId}
    LIMIT 1
  `);

  if (existing.length === 0) {
    await db.execute(sql`
      INSERT INTO ai_classification (ad_id, destination_id, confidence_score, created_at)
      VALUES (${adId}, ${destinationId}, ${confidenceScore}, NOW())
    `);
    return;
  }

  await db.execute(sql`
    UPDATE ai_classification
    SET destination_id = ${destinationId},
        confidence_score = ${confidenceScore},
        created_at = NOW()
    WHERE ad_id = ${adId}
  `);
}

export async function backfillAdClassifications(options: { ocrMissing?: boolean; limit?: number | null } = {}) {
  if (!hasDatabase()) {
    return {
      ok: false,
      processed: 0,
      classified: 0,
      ocrAttempted: 0,
      ocrFailed: 0,
      message: "DATABASE_URL is required for ads backfill.",
    };
  }

  const db = getDb();
  if (!db) {
    return {
      ok: false,
      processed: 0,
      classified: 0,
      ocrAttempted: 0,
      ocrFailed: 0,
      message: "Database client is unavailable.",
    };
  }

  const limit = options.limit && options.limit > 0 ? options.limit : 10000;
  const rows = await db.execute(sql<{
    ad_id: number;
    competitor_id: number;
    creative_id: string;
    advertiser_id: string | null;
    media_format: string | null;
    snapshot_id: number;
    image: unknown;
    videos: unknown;
    metadata: unknown;
  }>`
    WITH latest_snapshots AS (
      SELECT DISTINCT ON (snap.ad_id)
        snap.id,
        snap.ad_id,
        snap.image,
        snap.videos,
        snap.metadata
      FROM ad_snapshots snap
      ORDER BY snap.ad_id, snap.created_at DESC
    )
    SELECT
      a.id AS ad_id,
      a.competitor_id,
      a.creative_id,
      a.advertiser_id,
      a.media_format,
      snap.id AS snapshot_id,
      snap.image,
      snap.videos,
      snap.metadata
    FROM ads a
    INNER JOIN latest_snapshots snap ON snap.ad_id = a.id
    ORDER BY a.id DESC
    LIMIT ${limit}
  `);

  let classified = 0;
  let ocrAttempted = 0;
  let ocrFailed = 0;

  try {
    for (const row of rows) {
      const metadata = asRecord(row.metadata) ?? {};
      const existingOcrText = asText(metadata.ocr_text);
      const previewImageUrl = getPreviewImageUrl(row.image, metadata);
      let ocrText = existingOcrText;
      let updatedMetadata: Record<string, unknown> | null = null;

      if (options.ocrMissing && !ocrText && previewImageUrl) {
        ocrAttempted += 1;
        updatedMetadata = {
          ...metadata,
          ocr_attempted: true,
          ocr_source_url: previewImageUrl,
        };

        try {
          ocrText = await extractTextFromImage(previewImageUrl, `${row.creative_id}:${previewImageUrl}`);
          updatedMetadata.ocr_text = ocrText;
          updatedMetadata.ocr_error = ocrText ? null : "no_text_detected";
          if (!ocrText) {
            ocrFailed += 1;
          }
        } catch (error) {
          ocrText = null;
          ocrFailed += 1;
          updatedMetadata.ocr_text = null;
          updatedMetadata.ocr_error = error instanceof Error ? error.message : "Unknown OCR error.";
        }

        await db.execute(sql`
          UPDATE ad_snapshots
          SET metadata = ${JSON.stringify(updatedMetadata)}::jsonb
          WHERE id = ${row.snapshot_id}
        `);
      }

      const destinationId = matchDestinationId(
        buildAdClassificationText({
          advertiserTitle: asText(metadata.advertiser_title),
          target: asText(metadata.target),
          transparencyUrl: asText(metadata.transparency_url),
          previewImageUrl,
          metadata: updatedMetadata ?? metadata,
          image: row.image,
          videos: row.videos,
          ocrText,
        }),
        Number(row.competitor_id),
      );

      const confidenceScore = destinationId ? (ocrText ? 0.82 : 0.45) : null;
      await upsertAdClassification(Number(row.ad_id), destinationId, confidenceScore);

      if (destinationId) {
        classified += 1;
      }
    }
  } finally {
    if (options.ocrMissing) {
      await shutdownOcr();
    }
  }

  return {
    ok: true,
    processed: rows.length,
    classified,
    ocrAttempted,
    ocrFailed,
    message: `Ads backfill processed ${rows.length} ads and classified ${classified}.`,
  };
}

export async function repairAdStatuses(options: { apply?: boolean } = {}) {
  if (!hasDatabase()) {
    return {
      ok: false,
      apply: Boolean(options.apply),
      message: "DATABASE_URL is required to repair ad statuses.",
    };
  }

  const db = getDb();
  if (!db) {
    return {
      ok: false,
      apply: Boolean(options.apply),
      message: "Database client is not available.",
    };
  }

  const apply = Boolean(options.apply);
  const runDate = todayDate();
  const snapshotRows = await db.execute(sql<{
    snapshot_id: number;
    ad_id: number;
    creative_id: string | null;
    advertiser_id: string | null;
    media_format: string | null;
    image: unknown;
    videos: unknown;
    metadata: unknown;
    snapshot_hash: string | null;
    snapshot_date: Date | string;
    created_at: Date | string;
  }>`
    SELECT
      snap.id AS snapshot_id,
      snap.ad_id,
      a.creative_id,
      a.advertiser_id,
      a.media_format,
      snap.image,
      snap.videos,
      snap.metadata,
      snap.snapshot_hash,
      snap.snapshot_date,
      snap.created_at
    FROM ad_snapshots snap
    JOIN ads a ON a.id = snap.ad_id
    ORDER BY snap.ad_id, snap.created_at DESC
  `);

  const snapshotsByAd = new Map<
    number,
    Array<{
      snapshotId: number;
      stableHash: string;
      storedHash: string | null;
      metadata: unknown;
      snapshotDate: unknown;
      createdAt: unknown;
    }>
  >();
  let snapshotsNeedingHashUpdate = 0;

  for (const row of snapshotRows) {
    const stableHash = createStableAdSnapshotHashFromStored({
      creativeId: asText(row.creative_id),
      advertiserId: asText(row.advertiser_id),
      mediaFormat: asText(row.media_format),
      image: row.image,
      videos: row.videos,
      metadata: row.metadata,
    });
    const storedHash = row.snapshot_hash ? String(row.snapshot_hash) : null;

    if (storedHash !== stableHash) {
      snapshotsNeedingHashUpdate += 1;
      if (apply) {
        await db.execute(sql`
          UPDATE ad_snapshots
          SET snapshot_hash = ${stableHash}
          WHERE id = ${Number(row.snapshot_id)}
        `);
      }
    }

    const adId = Number(row.ad_id);
    const snapshots = snapshotsByAd.get(adId) ?? [];
    snapshots.push({
      snapshotId: Number(row.snapshot_id),
      stableHash,
      storedHash,
      metadata: row.metadata,
      snapshotDate: row.snapshot_date,
      createdAt: row.created_at,
    });
    snapshotsByAd.set(adId, snapshots);
  }

  const statusRows = await db.execute(sql<{
    ad_id: number;
    status: string | null;
    became_removed_date: Date | string | null;
    should_be_new: boolean | null;
  }>`
    SELECT
      ad_id,
      status,
      became_removed_date,
      (became_new_date > CURRENT_DATE - INTERVAL '7 days') AS should_be_new
    FROM ad_status
    WHERE status = 'changed'
  `);

  const preserved = {
    differentStableHash: 0,
    reappearedRemoved: 0,
    noPreviousSnapshot: 0,
    notChanged: 0,
  };
  let repairedToNew = 0;
  let repairedToActive = 0;

  for (const row of statusRows) {
    const snapshots = snapshotsByAd.get(Number(row.ad_id)) ?? [];
    const latest = snapshots[0] ?? null;
    const previous = snapshots[1] ?? null;
    const decision = decideAdStatusRepair({
      status: asText(row.status),
      becameRemovedDate: row.became_removed_date,
      hasPreviousSnapshot: Boolean(previous),
      latestStableHash: latest?.stableHash ?? null,
      previousStableHash: previous?.stableHash ?? null,
      shouldBeNew: Boolean(row.should_be_new),
    });

    if (decision.action === "repair") {
      if (decision.status === "new") {
        repairedToNew += 1;
      } else {
        repairedToActive += 1;
      }

      if (apply) {
        await db.execute(sql`
          UPDATE ad_status
          SET status = ${decision.status}::lifecycle_status,
              changed_date = NULL,
              updated_at = NOW()
          WHERE ad_id = ${Number(row.ad_id)}
        `);
      }

      continue;
    }

    if (decision.reason === "different_stable_hash") preserved.differentStableHash += 1;
    if (decision.reason === "reappeared_removed") preserved.reappearedRemoved += 1;
    if (decision.reason === "no_previous_snapshot") preserved.noPreviousSnapshot += 1;
    if (decision.reason === "not_changed") preserved.notChanged += 1;
  }

  const removedRows = await db.execute(sql<{
    ad_id: number;
    status: string | null;
    became_new_date: Date | string | null;
    changed_date: Date | string | null;
    became_removed_date: Date | string | null;
    created_at: Date | string;
  }>`
    SELECT
      a.id AS ad_id,
      s.status,
      s.became_new_date,
      s.changed_date,
      s.became_removed_date,
      a.created_at
    FROM ads a
    JOIN ad_status s ON s.ad_id = a.id
    WHERE s.status = 'removed'
  `);

  let confirmedRemovedPreserved = 0;
  let unconfirmedRemovedRestored = 0;
  let restoredRemovedToNew = 0;
  let restoredRemovedToActive = 0;
  let restoredRemovedToChanged = 0;

  for (const row of removedRows) {
    const latest = snapshotsByAd.get(Number(row.ad_id))?.[0] ?? null;
    const metadata = asRecord(latest?.metadata);
    const raw = asRecord(metadata?.raw);
    const decision = decideRemovedStatusRepair({
      status: asText(row.status),
      becameNewDate: row.became_new_date,
      changedDate: row.changed_date,
      becameRemovedDate: row.became_removed_date,
      latestSnapshotDate: latest?.snapshotDate ?? null,
      latestRawLastShown: raw?.last_shown,
      runDate,
    });

    if (decision.action === "preserve") {
      if (decision.reason === "confirmed_removed") {
        confirmedRemovedPreserved += 1;
      }
      continue;
    }

    unconfirmedRemovedRestored += 1;
    if (decision.status === "new") restoredRemovedToNew += 1;
    if (decision.status === "active") restoredRemovedToActive += 1;
    if (decision.status === "changed") restoredRemovedToChanged += 1;

    if (apply) {
      const becameNewDate = dateKeyOrNull(row.became_new_date) ?? dateKeyFromUnknown(row.created_at);
      const changedDate = decision.status === "changed" ? (dateKeyOrNull(row.changed_date) ?? runDate) : null;

      await db.execute(sql`
        UPDATE ad_status
        SET status = ${decision.status}::lifecycle_status,
            became_new_date = ${becameNewDate},
            became_removed_date = NULL,
            changed_date = ${changedDate},
            updated_at = NOW()
        WHERE ad_id = ${Number(row.ad_id)}
      `);
    }
  }

  return {
    ok: true,
    apply,
    runDate,
    snapshotsChecked: snapshotRows.length,
    snapshotsRehashed: snapshotsNeedingHashUpdate,
    changedStatusesChecked: statusRows.length,
    statusesRepaired: repairedToNew + repairedToActive,
    repairedToNew,
    repairedToActive,
    preserved,
    removedStatusesChecked: removedRows.length,
    confirmedRemovedPreserved,
    unconfirmedRemovedRestored,
    restoredRemovedToNew,
    restoredRemovedToActive,
    restoredRemovedToChanged,
    message: apply
      ? `Ad status repair applied: ${snapshotsNeedingHashUpdate} snapshot hashes updated, ${repairedToNew + repairedToActive} changed statuses repaired, ${unconfirmedRemovedRestored} unconfirmed removals restored.`
      : `Ad status repair dry run: ${snapshotsNeedingHashUpdate} snapshot hashes would update, ${repairedToNew + repairedToActive} changed statuses would repair, ${unconfirmedRemovedRestored} unconfirmed removals would restore.`,
  };
}

async function persistAdRecord(
  record: NormalizedAdRecord,
  options: { runDate?: string; isCurrentlyShown?: boolean; observedRunId?: string | null } = {},
) {
  const db = getDb();
  if (!db) {
    return { adId: null, changeType: null as string | null };
  }

  const snapshotDate = options.runDate ?? todayDate();
  const isCurrentlyShown = options.isCurrentlyShown ?? isGoogleAdShownOnRunDate(record.lastShown, snapshotDate);
  const existing = await db.execute(sql<{
    id: number;
    creative_id: string | null;
    advertiser_id: string | null;
    media_format: string | null;
    image: unknown;
    videos: unknown;
    metadata: unknown;
    status: string | null;
  }>`
    SELECT
      a.id,
      a.creative_id,
      a.advertiser_id,
      a.media_format,
      snap.image,
      snap.videos,
      snap.metadata,
      s.status
    FROM ads a
    LEFT JOIN LATERAL (
      SELECT image, videos, metadata
      FROM ad_snapshots
      WHERE ad_id = a.id
      ORDER BY created_at DESC
      LIMIT 1
    ) snap ON true
    LEFT JOIN ad_status s ON s.ad_id = a.id
    WHERE a.creative_id = ${record.creativeId}
    LIMIT 1
  `);

  const imagePayload =
    record.previewImageUrl
      ? {
          url: record.previewImageUrl,
          height: record.previewImageHeight,
          width: record.previewImageWidth,
        }
      : null;
  const videoPayload =
    record.format === "video"
      ? {
          preview_url: record.previewUrl,
          preview_image_url: record.previewImageUrl,
        }
      : null;
  const metadataPayload = {
    advertiser_title: record.advertiserTitle,
    target: record.target,
    verified: record.verified,
    ocr_text: record.ocrText,
    ocr_attempted: record.ocrAttempted,
    ocr_source_url: record.ocrSourceUrl,
    ocr_error: record.ocrError,
    transparency_url: record.transparencyUrl,
    observed_run_id: options.observedRunId ?? null,
    raw: record.rawData,
  };

  if (existing.length === 0) {
    const inserted = await db.execute(sql<{ id: number }>`
      INSERT INTO ads (
        creative_id, competitor_id, advertiser_id, media_format,
        first_seen_global, last_seen_global, created_at
      )
      VALUES (
        ${record.creativeId},
        ${record.competitorId},
        ${record.advertiserId},
        ${record.format},
        ${record.firstShown},
        ${record.lastShown},
        NOW()
      )
      RETURNING id
    `);
    const adId = Number(inserted[0]?.id ?? 0);

    await db.execute(sql`
      INSERT INTO ad_snapshots (
        ad_id, snapshot_date, regions, image, videos, metadata, snapshot_hash, created_at
      )
      VALUES (
        ${adId},
        ${snapshotDate},
        ${JSON.stringify([{ location_name: getAdsSettings().locationName, platform: getAdsSettings().platform, target: record.target }])}::jsonb,
        ${JSON.stringify(imagePayload)}::jsonb,
        ${JSON.stringify(videoPayload)}::jsonb,
        ${JSON.stringify(metadataPayload)}::jsonb,
        ${record.snapshotHash},
        NOW()
      )
      ON CONFLICT (ad_id, snapshot_date) DO UPDATE
      SET regions = EXCLUDED.regions,
          image = EXCLUDED.image,
          videos = EXCLUDED.videos,
          metadata = EXCLUDED.metadata,
          snapshot_hash = EXCLUDED.snapshot_hash,
          created_at = NOW()
    `);
    const initialStatus = getReturnedAdLifecycleAction({
      exists: false,
      nextStableHash: record.snapshotHash,
      isCurrentlyShown,
    });

    await db.execute(sql`
      INSERT INTO ad_status (ad_id, status, became_new_date, updated_at)
      VALUES (${adId}, ${initialStatus}::lifecycle_status, ${snapshotDate}, NOW())
    `);
    if (initialStatus === "removed") {
      await db.execute(sql`
        UPDATE ad_status
        SET became_removed_date = ${snapshotDate}
        WHERE ad_id = ${adId}
      `);
    }
    await upsertAdClassification(adId, record.destinationId, record.confidenceScore);

    return { adId, changeType: initialStatus };
  }

  const adId = Number(existing[0]?.id ?? 0);
  const previousHash = existing[0]
    ? createStableAdSnapshotHashFromStored({
        creativeId: asText(existing[0].creative_id),
        advertiserId: asText(existing[0].advertiser_id),
        mediaFormat: asText(existing[0].media_format),
        image: existing[0].image,
        videos: existing[0].videos,
        metadata: existing[0].metadata,
      })
    : "";
  const previousStatus = String(existing[0]?.status ?? "active");
  const changeType = getReturnedAdLifecycleAction({
    exists: true,
    previousStatus,
    previousStableHash: previousHash,
    nextStableHash: record.snapshotHash,
    isCurrentlyShown,
  });

  await db.execute(sql`
    UPDATE ads
    SET competitor_id = ${record.competitorId},
        advertiser_id = ${record.advertiserId},
        media_format = ${record.format},
        first_seen_global = COALESCE(first_seen_global, ${record.firstShown}),
        last_seen_global = ${record.lastShown}
    WHERE id = ${adId}
  `);
  await db.execute(sql`
    INSERT INTO ad_snapshots (
      ad_id, snapshot_date, regions, image, videos, metadata, snapshot_hash, created_at
    )
    VALUES (
      ${adId},
      ${snapshotDate},
      ${JSON.stringify([{ location_name: getAdsSettings().locationName, platform: getAdsSettings().platform, target: record.target }])}::jsonb,
      ${JSON.stringify(imagePayload)}::jsonb,
      ${JSON.stringify(videoPayload)}::jsonb,
      ${JSON.stringify(metadataPayload)}::jsonb,
      ${record.snapshotHash},
      NOW()
    )
    ON CONFLICT (ad_id, snapshot_date) DO UPDATE
    SET regions = EXCLUDED.regions,
        image = EXCLUDED.image,
        videos = EXCLUDED.videos,
        metadata = EXCLUDED.metadata,
        snapshot_hash = EXCLUDED.snapshot_hash,
        created_at = NOW()
  `);
  await upsertAdClassification(adId, record.destinationId, record.confidenceScore);

  if (changeType === "removed") {
    await db.execute(sql`
      UPDATE ad_status
      SET status = 'removed',
          became_removed_date = ${snapshotDate},
          updated_at = NOW()
      WHERE ad_id = ${adId}
    `);
    return { adId, changeType: "removed" as const };
  }

  if (changeType === "changed") {
    await db.execute(sql`
      UPDATE ad_status
      SET status = 'changed',
          changed_date = ${snapshotDate},
          updated_at = NOW()
      WHERE ad_id = ${adId}
    `);
    return { adId, changeType: "changed" as const };
  }

  await db.execute(sql`
    UPDATE ad_status
    SET updated_at = NOW()
    WHERE ad_id = ${adId}
  `);

  return { adId, changeType: null };
}

async function ageAdStatuses(runDate = todayDate()) {
  if (!hasDatabase()) return;

  const db = getDb();
  if (!db) return;

  await db.execute(sql`
    UPDATE ad_status
    SET status = 'active',
        updated_at = NOW()
    WHERE status IN ('new', 'changed')
      AND COALESCE(changed_date, became_new_date) <= ${runDate}::date - INTERVAL '7 days'
  `);
}

async function runAdsJob(competitorSlug?: string, options?: WorkerRunOptions): Promise<JobRunResponse> {
  const configured = Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
  if (!configured) {
    return {
      ok: false,
      module: "ads",
      status: "blocked",
      competitorSlug: competitorSlug ?? null,
      message: "Ads sync is blocked until DataForSEO credentials are provided.",
      runId: null,
      counts: {
        recordsSeen: 0,
        recordsChanged: 0,
        competitorsProcessed: 0,
      },
    };
  }

  const settings = getAdsSettings();
  const slugs = competitorSlug ? [competitorSlug as CompetitorSlug] : competitorSeed.map((item) => item.slug as CompetitorSlug);
  const runId = `ads-${Date.now()}`;
  const runDate = todayDate();
  const artifactResults: AdsArtifactResult[] = [];
  let totalSeen = 0;
  let totalChanged = 0;
  const statuses: JobRunStatus[] = [];
  const timeoutMs = getTimeoutMs("ads");

  try {
    for (const slug of slugs) {
      const competitor = competitorSeed.find((item) => item.slug === slug);
      if (!competitor) {
        throw new Error(`Unknown competitor: ${slug}`);
      }

      const targets = ADS_COMPETITOR_TARGETS[slug] ?? [new URL(competitor.websiteUrl).hostname];
      const startedAt = Date.now();
      const competitorRunId = createRunId("ads", slug);
      const jobRunId = await startJobRun(competitorRunId, "ads_sync", competitor.id, options?.batchRunId);

      emitWorkerLog(options, {
        event: "competitor.started",
        module: "ads",
        competitorSlug: slug,
        status: "running",
        runId: competitorRunId,
        message: `${competitor.name} ads started.`,
      });

      try {
        const competitorResult = await withTimeout(
          (async () => {
            const rawRecords: Array<{
              target: string;
              advertiserId: string;
              advertiserTitle: string;
              creativeId: string;
              transparencyUrl: string;
              verified: boolean;
              format: string;
              previewImageUrl: string | null;
              previewImageHeight: number | null;
              previewImageWidth: number | null;
              previewUrl: string | null;
              firstShown: string | null;
              lastShown: string | null;
              rawData: Record<string, unknown>;
            }> = [];
            const notes: string[] = [];
            const blockers: Array<{ code: string; message: string }> = [];
            let hardFailures = 0;

            for (const target of targets) {
              try {
                const result = await fetchGoogleAdsByTarget({
                  target,
                  locationName: settings.locationName,
                  platform: settings.platform,
                  depth: settings.depth,
                });

                if (result.status === "no_results") {
                  notes.push(`${target}: no Google ads found in ${settings.locationName}.`);
                  continue;
                }

                notes.push(`${target}: ${result.items.length} ads fetched.`);

                rawRecords.push(
                  ...result.items.map((item) => ({
                    target,
                    advertiserId: item.advertiser_id,
                    advertiserTitle: item.title,
                    creativeId: item.creative_id,
                    transparencyUrl: item.url,
                    verified: Boolean(item.verified),
                    format: item.format,
                    previewImageUrl: item.preview_image?.url ?? null,
                    previewImageHeight: typeof item.preview_image?.height === "number" ? item.preview_image.height : null,
                    previewImageWidth: typeof item.preview_image?.width === "number" ? item.preview_image.width : null,
                    previewUrl: item.preview_url ?? null,
                    firstShown: toIsoString(item.first_shown ?? null),
                    lastShown: toIsoString(item.last_shown ?? null),
                    rawData: item as unknown as Record<string, unknown>,
                  })),
                );
              } catch (error) {
                hardFailures += 1;
                const message = error instanceof Error ? error.message : "Unknown ads fetch error.";
                blockers.push({ code: "dataforseo_error", message: `${target}: ${message}` });
                await recordJobError(jobRunId, "dataforseo_error", message, { target });
              }
            }

            const enrichedRecords = await enrichAdsWithClassification(competitor.id, dedupeAds(rawRecords));

            const status: JobRunStatus =
              hardFailures === 0 ? "success" : enrichedRecords.length > 0 ? "partial" : "blocked";

            return {
              status,
              notes,
              blockers,
              records: enrichedRecords,
              hardFailures,
            };
          })(),
          timeoutMs,
          `${competitor.name} ads timed out after ${timeoutMs}ms.`,
        );

        let changedCount = 0;

        if (hasDatabase()) {
          for (const record of competitorResult.records) {
            const isCurrentlyShown = isGoogleAdShownOnRunDate(record.lastShown, runDate);
            const persisted = await persistAdRecord(record, {
              runDate,
              isCurrentlyShown,
              observedRunId: competitorRunId,
            });
            if (persisted.changeType) {
              changedCount += 1;
            }
          }

          await ageAdStatuses(runDate);
        }

        totalSeen += competitorResult.records.length;
        totalChanged += changedCount;
        statuses.push(competitorResult.status);

        artifactResults.push({
          competitorSlug: slug,
          competitorName: competitor.name,
          status: competitorResult.status,
          notes: competitorResult.notes,
          blockers: competitorResult.blockers,
          records: competitorResult.records,
        });

        await finishJobRun(
          jobRunId,
          competitorResult.status,
          competitorResult.records.length,
          changedCount,
          competitorResult.blockers.map((item) => item.message).join(" ") || null,
        );

        emitWorkerLog(options, {
          event: "competitor.finished",
          module: "ads",
          competitorSlug: slug,
          status: competitorResult.status,
          durationMs: Date.now() - startedAt,
          recordsSeen: competitorResult.records.length,
          recordsChanged: changedCount,
          runId: competitorRunId,
          message: `${competitor.name} ads ${competitorResult.status}.`,
        });
      } catch (error) {
        const errorCode = error instanceof WorkerTimeoutError ? error.code : "worker_error";
        const message = error instanceof Error ? error.message : "Unknown ads worker error.";

        statuses.push("failed");
        artifactResults.push({
          competitorSlug: slug,
          competitorName: competitor.name,
          status: "failed",
          notes: [],
          blockers: [{ code: errorCode, message }],
          records: [],
        });

        await recordJobError(jobRunId, errorCode, message, {
          competitorSlug: slug,
          module: "ads",
        });
        await finishJobRun(jobRunId, "failed", 0, 0, message);

        emitWorkerLog(options, {
          event: "competitor.failed",
          module: "ads",
          competitorSlug: slug,
          status: "failed",
          durationMs: Date.now() - startedAt,
          recordsSeen: 0,
          recordsChanged: 0,
          runId: competitorRunId,
          errorCode,
          message,
        });
      }
    }
  } finally {
    await shutdownOcr();
  }

  await writeAdsArtifact({
    runId,
    finishedAt: new Date().toISOString(),
    locationName: settings.locationName,
    platform: settings.platform,
    results: artifactResults,
  });

  const overallStatus = toJobStatus(statuses);

  return {
    ok: overallStatus !== "failed",
    module: "ads",
    status: overallStatus,
    competitorSlug: competitorSlug ?? null,
    message: `Ads sync ${overallStatus}. ${artifactResults
      .map((item) => `${item.competitorName}: ${item.status} (${item.records.length} records)`)
      .join(" | ")}`,
    runId,
    counts: {
      recordsSeen: totalSeen,
      recordsChanged: totalChanged,
      competitorsProcessed: slugs.length,
    },
  };
}

export async function runRequestedJob(request: JobRunRequest, options?: WorkerRunOptions): Promise<JobRunResponse> {
  switch (request.module) {
    case "offers":
      return runOffersJob(request.competitorSlug, options);
    case "marketing":
      return runMarketingJob(request.competitorSlug, options);
    case "ads":
      return runAdsJob(request.competitorSlug, options);
    default:
      throw new Error(`Unsupported module: ${(request as { module?: string }).module ?? "unknown"}`);
  }
}

export { destinationSeed };
