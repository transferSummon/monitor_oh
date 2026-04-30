import { sql } from "drizzle-orm";
import type {
  AdsResponse,
  AdsSummaryResponse,
  CompetitorDto,
  DestinationDto,
  JobRunRequest,
  LifecycleStatus,
  MarketingOffersResponse,
  NotificationSource,
  NotificationType,
  NotificationsResponse,
  OffersResponse,
  OffersSummaryResponse,
} from "@olympic/contracts";
import { getDb, hasDatabase } from "@olympic/db";

import {
  filterByIds,
  filterBySearch,
  loadDemoStore,
  paginate,
  sortByField,
} from "./demo-store";
import { extractAdImageMedia, extractAdVideoMedia } from "./ad-media";

function toInt(value: string | null | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toOrder(value: string | null | undefined): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function toLifecycleStatus(value: unknown, fallback: LifecycleStatus = "active"): LifecycleStatus {
  return value === "new" || value === "active" || value === "removed" || value === "changed" ? value : fallback;
}

function toIsoString(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value).toISOString();
  }
  return null;
}

function toNotificationType(value: unknown): NotificationType {
  return value === "updated_offer" || value === "removed_offer" ? value : "new_offer";
}

function toNotificationSource(value: unknown): NotificationSource {
  return value === "marketing" ? "marketing" : "offers";
}

function toFilterValue(searchParams: URLSearchParams, key: string) {
  const values = searchParams
    .getAll(key)
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length > 0) {
    return values.join(",");
  }

  const single = searchParams.get(key);
  return single && single.trim() ? single : null;
}

function timestampMs(value: unknown) {
  if (value instanceof Date) return value.getTime();

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

export function isAdVisibleForLatestRun(input: {
  status: string | null;
  latestJobRunId: string | null;
  latestJobStartedAt: unknown;
  observedRunId: string | null;
  latestSnapshotCreatedAt: unknown;
}) {
  if (input.status === "removed") return true;
  if (!input.latestJobRunId) return true;
  if (input.observedRunId && input.observedRunId === input.latestJobRunId) return true;
  if (input.observedRunId) return false;

  const snapshotCreatedAt = timestampMs(input.latestSnapshotCreatedAt);
  const latestJobStartedAt = timestampMs(input.latestJobStartedAt);

  return Boolean(
    snapshotCreatedAt !== null &&
      latestJobStartedAt !== null &&
      snapshotCreatedAt >= latestJobStartedAt,
  );
}

export async function listCompetitors(): Promise<CompetitorDto[]> {
  if (!hasDatabase()) {
    const demo = await loadDemoStore();
    return demo.competitors;
  }

  const db = getDb();
  if (!db) return [];

  const rows = await db.execute(sql<{
    id: number;
    slug: string;
    name: string;
    website_url: string;
    capabilities: unknown;
  }>`
    SELECT
      c.id,
      c.slug,
      c.name,
      c.website_url,
      COALESCE(
        json_agg(
          json_build_object(
            'module', cc.module,
            'state', cc.state,
            'note', cc.note
          )
        ) FILTER (WHERE cc.id IS NOT NULL),
        '[]'::json
      ) AS capabilities
    FROM competitors c
    LEFT JOIN competitor_capabilities cc
      ON cc.competitor_id = c.id
    GROUP BY c.id, c.slug, c.name, c.website_url
    ORDER BY c.name ASC
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    websiteUrl: String(row.website_url),
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
  }));
}

export async function listDestinations(): Promise<DestinationDto[]> {
  if (!hasDatabase()) {
    const demo = await loadDemoStore();
    return demo.destinations;
  }

  const db = getDb();
  if (!db) return [];

  const rows = await db.execute(sql<{ id: number; name: string; country: string }>`
    SELECT id, name, country
    FROM destinations
    ORDER BY country ASC, name ASC
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    country: String(row.country),
  }));
}

export async function listAds(searchParams: URLSearchParams): Promise<AdsResponse> {
  const page = toInt(searchParams.get("page"), 1);
  const limit = Math.min(toInt(searchParams.get("limit"), 200), 200);

  if (!hasDatabase()) {
    const demo = await loadDemoStore();
    let items = demo.ads;
    items = filterByIds(items, toFilterValue(searchParams, "competitor_id") ?? undefined, (item) => item.competitorId);
    items = filterByIds(items, toFilterValue(searchParams, "destination_id") ?? undefined, (item) => item.destinationId);
    items = filterBySearch(items, searchParams.get("search") ?? undefined, (item) =>
      [item.creativeId, item.competitorName, item.destinationName ?? "", item.transparencyUrl ?? ""].join(" "),
    );
    items = sortByField(items, searchParams.get("sort") ?? undefined, toOrder(searchParams.get("order")), "snapshotDate");
    const { items: paged, pagination } = paginate(items, page, limit);
    return { ads: paged, pagination };
  }

  const db = getDb();
  if (!db) return { ads: [], pagination: { total: 0, page, limit, hasNextPage: false } };

  const status = searchParams.get("status");
  const competitorId = toFilterValue(searchParams, "competitor_id");
  const destinationId = toFilterValue(searchParams, "destination_id");
  const search = searchParams.get("search");
  const rows = await db.execute(sql<any>`
    WITH latest_status AS (
      SELECT DISTINCT ON (s.ad_id)
        s.ad_id,
        s.status,
        s.became_new_date,
        s.became_removed_date,
        s.changed_date,
        s.updated_at
      FROM ad_status s
      ORDER BY s.ad_id, s.updated_at DESC
    ),
    latest_successful_ads_jobs AS (
      SELECT DISTINCT ON (jr.competitor_id)
        jr.competitor_id,
        jr.run_id,
        jr.started_at
      FROM job_runs jr
      WHERE jr.job_type = 'ads_sync'
        AND jr.status = 'success'
      ORDER BY jr.competitor_id, jr.started_at DESC
    ),
    latest_snapshots AS (
      SELECT DISTINCT ON (snap.ad_id)
        snap.ad_id,
        snap.snapshot_date,
        snap.regions,
        snap.image,
        snap.videos,
        snap.metadata,
        snap.created_at
      FROM ad_snapshots snap
      ORDER BY snap.ad_id, snap.created_at DESC
    )
    SELECT
      a.id,
      a.creative_id,
      a.competitor_id,
      c.name AS competitor_name,
      ai.destination_id,
      d.name AS destination_name,
      d.country AS destination_country,
      a.media_format,
      a.first_seen_global,
      a.last_seen_global,
      ls.status,
      ls.updated_at AS status_updated_at,
      ls.became_new_date,
      ls.changed_date,
      ls.became_removed_date,
      snap.snapshot_date,
      snap.regions,
      snap.image,
      snap.videos,
      snap.metadata,
      snap.created_at AS snapshot_created_at,
      latest_job.run_id AS latest_ads_run_id,
      latest_job.started_at AS latest_ads_run_started_at,
      a.advertiser_id
    FROM ads a
    LEFT JOIN latest_status ls ON ls.ad_id = a.id
    LEFT JOIN latest_snapshots snap ON snap.ad_id = a.id
    LEFT JOIN latest_successful_ads_jobs latest_job ON latest_job.competitor_id = a.competitor_id
    LEFT JOIN ai_classification ai ON ai.ad_id = a.id
    LEFT JOIN destinations d ON d.id = ai.destination_id
    LEFT JOIN competitors c ON c.id = a.competitor_id
    WHERE (${status}::text IS NULL OR ls.status = ${status})
      AND (${competitorId}::text IS NULL OR a.competitor_id = ANY(string_to_array(${competitorId}, ',')::int[]))
      AND (${destinationId}::text IS NULL OR ai.destination_id = ANY(string_to_array(${destinationId}, ',')::int[]))
      AND (${search}::text IS NULL OR a.creative_id ILIKE ${`%${search ?? ""}%`} OR c.name ILIKE ${`%${search ?? ""}%`})
      AND (
        ls.status = 'removed'
        OR latest_job.run_id IS NULL
        OR snap.metadata->>'observed_run_id' = latest_job.run_id
        OR (
          snap.metadata->>'observed_run_id' IS NULL
          AND snap.created_at >= latest_job.started_at
        )
      )
    ORDER BY a.created_at DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `);
  const totalRows = await db.execute(sql<{ count: number }>`
    WITH latest_status AS (
      SELECT DISTINCT ON (s.ad_id)
        s.ad_id,
        s.status
      FROM ad_status s
      ORDER BY s.ad_id, s.updated_at DESC
    ),
    latest_successful_ads_jobs AS (
      SELECT DISTINCT ON (jr.competitor_id)
        jr.competitor_id,
        jr.run_id,
        jr.started_at
      FROM job_runs jr
      WHERE jr.job_type = 'ads_sync'
        AND jr.status = 'success'
      ORDER BY jr.competitor_id, jr.started_at DESC
    ),
    latest_snapshots AS (
      SELECT DISTINCT ON (snap.ad_id)
        snap.ad_id,
        snap.metadata,
        snap.created_at
      FROM ad_snapshots snap
      ORDER BY snap.ad_id, snap.created_at DESC
    )
    SELECT COUNT(*)::int AS count
    FROM ads a
    LEFT JOIN latest_status ls ON ls.ad_id = a.id
    LEFT JOIN latest_snapshots snap ON snap.ad_id = a.id
    LEFT JOIN latest_successful_ads_jobs latest_job ON latest_job.competitor_id = a.competitor_id
    LEFT JOIN ai_classification ai ON ai.ad_id = a.id
    LEFT JOIN competitors c ON c.id = a.competitor_id
    WHERE (${status}::text IS NULL OR ls.status = ${status})
      AND (${competitorId}::text IS NULL OR a.competitor_id = ANY(string_to_array(${competitorId}, ',')::int[]))
      AND (${destinationId}::text IS NULL OR ai.destination_id = ANY(string_to_array(${destinationId}, ',')::int[]))
      AND (${search}::text IS NULL OR a.creative_id ILIKE ${`%${search ?? ""}%`} OR c.name ILIKE ${`%${search ?? ""}%`})
      AND (
        ls.status = 'removed'
        OR latest_job.run_id IS NULL
        OR snap.metadata->>'observed_run_id' = latest_job.run_id
        OR (
          snap.metadata->>'observed_run_id' IS NULL
          AND snap.created_at >= latest_job.started_at
        )
      )
  `);
  const total = Number(totalRows[0]?.count ?? 0);

  return {
    ads: rows.map((row) => {
      const metadata =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : null;
      const imageMedia = extractAdImageMedia(row.image, metadata);
      const videoMedia = extractAdVideoMedia(row.videos, metadata);

      return {
        id: Number(row.id),
        creativeId: String(row.creative_id),
        competitorId: Number(row.competitor_id),
        competitorName: String(row.competitor_name ?? ""),
        destinationId: row.destination_id ? Number(row.destination_id) : null,
        destinationName: row.destination_name ? String(row.destination_name) : null,
        destinationCountry: row.destination_country ? String(row.destination_country) : null,
        format: row.media_format ? String(row.media_format) : null,
        firstSeenGlobal: toIsoString(row.first_seen_global),
        lastSeenGlobal: toIsoString(row.last_seen_global),
        status: toLifecycleStatus(row.status),
        statusUpdatedAt: toIsoString(row.status_updated_at),
        becameNewDate: row.became_new_date ? String(row.became_new_date) : null,
        changedDate: row.changed_date ? String(row.changed_date) : null,
        becameRemovedDate: row.became_removed_date ? String(row.became_removed_date) : null,
        snapshotDate: row.snapshot_date ? String(row.snapshot_date) : null,
        imageUrl: imageMedia?.url ?? videoMedia?.previewImageUrl ?? null,
        videoUrl: videoMedia?.previewUrl ?? null,
        regions: row.regions ?? null,
        media: {
          image: imageMedia,
          video: videoMedia,
        },
        transparencyUrl:
          row.advertiser_id && row.creative_id
            ? `https://adstransparency.google.com/advertiser/${row.advertiser_id}/creative/${row.creative_id}?region=GB`
            : null,
        metadata,
      };
    }),
    pagination: {
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
    },
  };
}

export async function getAdsSummary(searchParams: URLSearchParams = new URLSearchParams()): Promise<AdsSummaryResponse> {
  if (!hasDatabase()) {
    const demo = await loadDemoStore();
    let items = demo.ads;
    items = filterByIds(items, toFilterValue(searchParams, "competitor_id") ?? undefined, (item) => item.competitorId);
    items = filterByIds(items, toFilterValue(searchParams, "destination_id") ?? undefined, (item) => item.destinationId);
    items = filterBySearch(items, searchParams.get("search") ?? undefined, (item) =>
      [item.creativeId, item.competitorName, item.destinationName ?? "", item.transparencyUrl ?? ""].join(" "),
    );
    const status = searchParams.get("status");
    if (status) {
      items = items.filter((item) => item.status === status);
    }

    return {
      totalAds: items.length,
      newAds: items.filter((item) => item.status === "new").length,
      activeAds: items.filter((item) => item.status === "active").length,
      removedAds: items.filter((item) => item.status === "removed").length,
      changedAds: items.filter((item) => item.status === "changed").length,
    };
  }

  const db = getDb();
  if (!db) {
    return { totalAds: 0, newAds: 0, activeAds: 0, removedAds: 0, changedAds: 0 };
  }

  const status = searchParams.get("status");
  const competitorId = toFilterValue(searchParams, "competitor_id");
  const destinationId = toFilterValue(searchParams, "destination_id");
  const search = searchParams.get("search");

  const rows = await db.execute(sql<AdsSummaryResponse>`
    WITH latest_status AS (
      SELECT DISTINCT ON (s.ad_id)
        s.ad_id,
        s.status
      FROM ad_status s
      ORDER BY s.ad_id, s.updated_at DESC
    ),
    latest_successful_ads_jobs AS (
      SELECT DISTINCT ON (jr.competitor_id)
        jr.competitor_id,
        jr.run_id,
        jr.started_at
      FROM job_runs jr
      WHERE jr.job_type = 'ads_sync'
        AND jr.status = 'success'
      ORDER BY jr.competitor_id, jr.started_at DESC
    ),
    latest_snapshots AS (
      SELECT DISTINCT ON (snap.ad_id)
        snap.ad_id,
        snap.metadata,
        snap.created_at
      FROM ad_snapshots snap
      ORDER BY snap.ad_id, snap.created_at DESC
    )
    SELECT
      COUNT(*)::int AS "totalAds",
      COUNT(*) FILTER (WHERE status = 'new')::int AS "newAds",
      COUNT(*) FILTER (WHERE status = 'active')::int AS "activeAds",
      COUNT(*) FILTER (WHERE status = 'removed')::int AS "removedAds",
      COUNT(*) FILTER (WHERE status = 'changed')::int AS "changedAds"
    FROM latest_status ls
    JOIN ads a ON a.id = ls.ad_id
    LEFT JOIN latest_snapshots snap ON snap.ad_id = a.id
    LEFT JOIN latest_successful_ads_jobs latest_job ON latest_job.competitor_id = a.competitor_id
    LEFT JOIN ai_classification ai ON ai.ad_id = a.id
    LEFT JOIN competitors c ON c.id = a.competitor_id
    WHERE (${status}::text IS NULL OR ls.status = ${status})
      AND (${competitorId}::text IS NULL OR a.competitor_id = ANY(string_to_array(${competitorId}, ',')::int[]))
      AND (${destinationId}::text IS NULL OR ai.destination_id = ANY(string_to_array(${destinationId}, ',')::int[]))
      AND (${search}::text IS NULL OR a.creative_id ILIKE ${`%${search ?? ""}%`} OR c.name ILIKE ${`%${search ?? ""}%`})
      AND (
        ls.status = 'removed'
        OR latest_job.run_id IS NULL
        OR snap.metadata->>'observed_run_id' = latest_job.run_id
        OR (
          snap.metadata->>'observed_run_id' IS NULL
          AND snap.created_at >= latest_job.started_at
        )
      )
  `);

  return {
    totalAds: Number(rows[0]?.totalAds ?? 0),
    newAds: Number(rows[0]?.newAds ?? 0),
    activeAds: Number(rows[0]?.activeAds ?? 0),
    removedAds: Number(rows[0]?.removedAds ?? 0),
    changedAds: Number(rows[0]?.changedAds ?? 0),
  };
}

export async function listOffers(searchParams: URLSearchParams): Promise<OffersResponse> {
  const page = toInt(searchParams.get("page"), 1);
  const limit = Math.min(toInt(searchParams.get("limit"), 200), 200);

  if (!hasDatabase()) {
    const demo = await loadDemoStore();
    let items = demo.offers;
    const status = searchParams.get("status");
    if (status) {
      items = items.filter((item) => item.status === status);
    }
    items = filterByIds(items, toFilterValue(searchParams, "competitor_id") ?? undefined, (item) => item.competitorId);
    items = filterByIds(items, toFilterValue(searchParams, "destination_id") ?? undefined, (item) => item.destinationId);
    items = filterBySearch(items, searchParams.get("search") ?? undefined, (item) =>
      [item.offerTitle, item.offerUrl, item.competitorName, item.destinationName ?? ""].join(" "),
    );
    items = sortByField(items, searchParams.get("sort") ?? undefined, toOrder(searchParams.get("order")), "createdAt");
    const { items: paged, pagination } = paginate(items, page, limit);
    return { offers: paged, pagination };
  }

  const db = getDb();
  if (!db) return { offers: [], pagination: { total: 0, page, limit, hasNextPage: false } };

  const status = searchParams.get("status");
  const competitorId = toFilterValue(searchParams, "competitor_id");
  const destinationId = toFilterValue(searchParams, "destination_id");
  const search = searchParams.get("search");
  const rows = await db.execute(sql<any>`
    WITH latest_status AS (
      SELECT DISTINCT ON (s.offer_id)
        s.offer_id,
        s.status,
        s.updated_at,
        s.became_new_date,
        s.became_removed_date,
        s.changed_date
      FROM offer_status s
      ORDER BY s.offer_id, s.updated_at DESC
    )
    SELECT
      o.id,
      o.external_id,
      o.offer_title,
      o.offer_url,
      o.price_numeric,
      o.currency,
      o.price_text,
      o.duration_days,
      o.departure_date,
      o.image_url,
      o.description,
      o.created_at,
      ls.status,
      ls.updated_at AS status_updated_at,
      c.id AS competitor_id,
      c.name AS competitor_name,
      d.id AS destination_id,
      d.name AS destination_name,
      d.country AS destination_country
    FROM scraped_offers o
    LEFT JOIN latest_status ls ON ls.offer_id = o.id
    LEFT JOIN competitors c ON c.id = o.competitor_id
    LEFT JOIN offer_classification oc ON oc.offer_id = o.id
    LEFT JOIN destinations d ON d.id = oc.destination_id
    WHERE (${status}::text IS NULL OR ls.status = ${status})
      AND (${competitorId}::text IS NULL OR o.competitor_id = ANY(string_to_array(${competitorId}, ',')::int[]))
      AND (${destinationId}::text IS NULL OR oc.destination_id = ANY(string_to_array(${destinationId}, ',')::int[]))
      AND (${search}::text IS NULL OR o.offer_title ILIKE ${`%${search ?? ""}%`} OR o.offer_url ILIKE ${`%${search ?? ""}%`})
    ORDER BY o.created_at DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `);
  const totalRows = await db.execute(sql<{ count: number }>`
    WITH latest_status AS (
      SELECT DISTINCT ON (s.offer_id)
        s.offer_id,
        s.status
      FROM offer_status s
      ORDER BY s.offer_id, s.updated_at DESC
    )
    SELECT COUNT(*)::int AS count
    FROM scraped_offers o
    LEFT JOIN latest_status ls ON ls.offer_id = o.id
    LEFT JOIN offer_classification oc ON oc.offer_id = o.id
    WHERE (${status}::text IS NULL OR ls.status = ${status})
      AND (${competitorId}::text IS NULL OR o.competitor_id = ANY(string_to_array(${competitorId}, ',')::int[]))
      AND (${destinationId}::text IS NULL OR oc.destination_id = ANY(string_to_array(${destinationId}, ',')::int[]))
      AND (${search}::text IS NULL OR o.offer_title ILIKE ${`%${search ?? ""}%`} OR o.offer_url ILIKE ${`%${search ?? ""}%`})
  `);
  const total = Number(totalRows[0]?.count ?? 0);

  return {
    offers: rows.map((row) => ({
      id: Number(row.id),
      externalId: String(row.external_id),
      offerTitle: String(row.offer_title ?? ""),
      offerUrl: String(row.offer_url ?? ""),
      priceNumeric: row.price_numeric ? String(row.price_numeric) : null,
      currency: String(row.currency ?? "GBP"),
      priceText: String(row.price_text ?? ""),
      durationDays: row.duration_days ? Number(row.duration_days) : null,
      departureDate: row.departure_date ? String(row.departure_date) : null,
      imageUrl: row.image_url ? String(row.image_url) : null,
      description: row.description ? String(row.description) : null,
      createdAt: toIsoString(row.created_at) ?? new Date(0).toISOString(),
      status: toLifecycleStatus(row.status),
      statusUpdatedAt: toIsoString(row.status_updated_at),
      competitorId: Number(row.competitor_id),
      competitorName: String(row.competitor_name ?? ""),
      destinationId: row.destination_id ? Number(row.destination_id) : null,
      destinationName: row.destination_name ? String(row.destination_name) : null,
      destinationCountry: row.destination_country ? String(row.destination_country) : null,
    })),
    pagination: {
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
    },
  };
}

export async function getOffersSummary(searchParams: URLSearchParams = new URLSearchParams()): Promise<OffersSummaryResponse> {
  if (!hasDatabase()) {
    const demo = await loadDemoStore();
    let items = demo.offers;
    const status = searchParams.get("status");
    if (status) {
      items = items.filter((item) => item.status === status);
    }
    items = filterByIds(items, toFilterValue(searchParams, "competitor_id") ?? undefined, (item) => item.competitorId);
    items = filterByIds(items, toFilterValue(searchParams, "destination_id") ?? undefined, (item) => item.destinationId);
    items = filterBySearch(items, searchParams.get("search") ?? undefined, (item) =>
      [item.offerTitle, item.offerUrl, item.competitorName, item.destinationName ?? ""].join(" "),
    );

    return {
      totalOffers: items.length,
      newOffers: items.filter((item) => item.status === "new").length,
      activeOffers: items.filter((item) => item.status === "active").length,
      removedOffers: items.filter((item) => item.status === "removed").length,
      changedOffers: items.filter((item) => item.status === "changed").length,
    };
  }

  const db = getDb();
  if (!db) {
    return { totalOffers: 0, newOffers: 0, activeOffers: 0, removedOffers: 0, changedOffers: 0 };
  }

  const status = searchParams.get("status");
  const competitorId = toFilterValue(searchParams, "competitor_id");
  const destinationId = toFilterValue(searchParams, "destination_id");
  const search = searchParams.get("search");

  const rows = await db.execute(sql<OffersSummaryResponse>`
    WITH latest_status AS (
      SELECT DISTINCT ON (s.offer_id)
        s.offer_id,
        s.status
      FROM offer_status s
      ORDER BY s.offer_id, s.updated_at DESC
    )
    SELECT
      COUNT(*)::int AS "totalOffers",
      COUNT(*) FILTER (WHERE status = 'new')::int AS "newOffers",
      COUNT(*) FILTER (WHERE status = 'active')::int AS "activeOffers",
      COUNT(*) FILTER (WHERE status = 'removed')::int AS "removedOffers",
      COUNT(*) FILTER (WHERE status = 'changed')::int AS "changedOffers"
    FROM latest_status ls
    JOIN scraped_offers o ON o.id = ls.offer_id
    LEFT JOIN offer_classification oc ON oc.offer_id = o.id
    WHERE (${status}::text IS NULL OR ls.status = ${status})
      AND (${competitorId}::text IS NULL OR o.competitor_id = ANY(string_to_array(${competitorId}, ',')::int[]))
      AND (${destinationId}::text IS NULL OR oc.destination_id = ANY(string_to_array(${destinationId}, ',')::int[]))
      AND (${search}::text IS NULL OR o.offer_title ILIKE ${`%${search ?? ""}%`} OR o.offer_url ILIKE ${`%${search ?? ""}%`})
  `);

  return {
    totalOffers: Number(rows[0]?.totalOffers ?? 0),
    newOffers: Number(rows[0]?.newOffers ?? 0),
    activeOffers: Number(rows[0]?.activeOffers ?? 0),
    removedOffers: Number(rows[0]?.removedOffers ?? 0),
    changedOffers: Number(rows[0]?.changedOffers ?? 0),
  };
}

export async function listMarketingOffers(searchParams: URLSearchParams): Promise<MarketingOffersResponse> {
  const page = toInt(searchParams.get("page"), 1);
  const limit = Math.min(toInt(searchParams.get("limit"), 50), 100);

  if (!hasDatabase()) {
    const demo = await loadDemoStore();
    let items = demo.marketingOffers;
    items = filterByIds(items, toFilterValue(searchParams, "competitor_id") ?? undefined, (item) => item.competitorId);
    items = filterBySearch(items, searchParams.get("search") ?? undefined, (item) =>
      [item.title, item.description ?? "", item.rawText ?? "", item.url ?? ""].join(" "),
    );
    items = sortByField(items, searchParams.get("sort") ?? undefined, toOrder(searchParams.get("order")), "detectedAt");
    const { items: paged, pagination } = paginate(items, page, limit);
    return { offers: paged, pagination };
  }

  const db = getDb();
  if (!db) return { offers: [], pagination: { total: 0, page, limit, hasNextPage: false } };

  const competitorId = toFilterValue(searchParams, "competitor_id");
  const search = searchParams.get("search");
  const rows = await db.execute(sql<any>`
    SELECT
      mo.id,
      mo.title,
      mo.description,
      mo.url,
      mo.cta_text,
      mo.validity,
      mo.raw_text,
      mo.created_at,
      mo.detected_at,
      mo.competitor_id,
      c.name AS competitor_name
    FROM marketing_offers mo
    LEFT JOIN competitors c ON c.id = mo.competitor_id
    WHERE (${competitorId}::text IS NULL OR mo.competitor_id = ANY(string_to_array(${competitorId}, ',')::int[]))
      AND (${search}::text IS NULL OR mo.title ILIKE ${`%${search ?? ""}%`} OR mo.description ILIKE ${`%${search ?? ""}%`} OR mo.raw_text ILIKE ${`%${search ?? ""}%`})
    ORDER BY mo.detected_at DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `);
  const totalRows = await db.execute(sql<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM marketing_offers mo
    WHERE (${competitorId}::text IS NULL OR mo.competitor_id = ANY(string_to_array(${competitorId}, ',')::int[]))
      AND (${search}::text IS NULL OR mo.title ILIKE ${`%${search ?? ""}%`} OR mo.description ILIKE ${`%${search ?? ""}%`} OR mo.raw_text ILIKE ${`%${search ?? ""}%`})
  `);
  const total = Number(totalRows[0]?.count ?? 0);

  return {
    offers: rows.map((row) => ({
      id: Number(row.id),
      title: String(row.title ?? ""),
      description: row.description ? String(row.description) : null,
      url: row.url ? String(row.url) : null,
      ctaText: row.cta_text ? String(row.cta_text) : null,
      validity: row.validity ? String(row.validity) : null,
      rawText: row.raw_text ? String(row.raw_text) : null,
      createdAt: toIsoString(row.created_at) ?? new Date(0).toISOString(),
      detectedAt: toIsoString(row.detected_at) ?? new Date(0).toISOString(),
      competitorId: Number(row.competitor_id),
      competitorName: String(row.competitor_name ?? ""),
    })),
    pagination: {
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
    },
  };
}

export async function listAlerts(searchParams: URLSearchParams): Promise<NotificationsResponse> {
  const page = toInt(searchParams.get("page"), 1);
  const limit = Math.min(toInt(searchParams.get("limit"), 20), 100);

  if (!hasDatabase()) {
    const demo = await loadDemoStore();
    let items = demo.alerts;
    const status = searchParams.get("status");
    const source = searchParams.get("source");
    if (status) {
      items = items.filter((item) => item.statusFilter === status);
    }
    if (source === "offers" || source === "marketing") {
      items = items.filter((item) => item.source === source);
    }
    items = filterByIds(items, toFilterValue(searchParams, "competitor_id") ?? undefined, (item) =>
      item.competitorId ? Number(item.competitorId) : null,
    );
    items = filterByIds(items, toFilterValue(searchParams, "destination_id") ?? undefined, (item) =>
      item.destinationId ? Number(item.destinationId) : null,
    );
    items = filterBySearch(items, searchParams.get("search") ?? undefined, (item) =>
      [item.message, item.competitorName, item.destinationName ?? "", item.priceText ?? ""].join(" "),
    );
    items = sortByField(items, "createdAt", toOrder(searchParams.get("order")), "createdAt");
    const { items: paged, pagination } = paginate(items, page, limit);
    return {
      alerts: paged,
      unreadCount: items.length,
      totalCount: pagination.total,
      hasNextPage: pagination.hasNextPage,
    };
  }

  const db = getDb();
  if (!db) return { alerts: [], unreadCount: 0, totalCount: 0, hasNextPage: false };

  const status = searchParams.get("status");
  const source = searchParams.get("source");
  const competitorId = toFilterValue(searchParams, "competitor_id");
  const destinationId = toFilterValue(searchParams, "destination_id");
  const search = searchParams.get("search");
  const rows = await db.execute(sql<any>`
    SELECT
      a.id,
      a.type,
      a.message,
      a.created_at,
      o.id AS offer_id,
      o.offer_url,
      o.price_text,
      o.image_url,
      os.status AS current_status,
      COALESCE(o.competitor_id, mo.competitor_id) AS competitor_id,
      c.name AS competitor_name,
      d.id AS destination_id,
      d.name AS destination_name,
      CASE
        WHEN a.marketing_offer_id IS NOT NULL THEN 'marketing'
        ELSE 'offers'
      END AS source
    FROM alerts a
    LEFT JOIN scraped_offers o ON o.id = a.offer_id
    LEFT JOIN marketing_offers mo ON mo.id = a.marketing_offer_id
    LEFT JOIN offer_status os ON os.offer_id = o.id
    LEFT JOIN competitors c ON c.id = COALESCE(o.competitor_id, mo.competitor_id)
    LEFT JOIN offer_classification oc ON oc.offer_id = o.id
    LEFT JOIN destinations d ON d.id = oc.destination_id
    WHERE (${competitorId}::text IS NULL OR COALESCE(o.competitor_id, mo.competitor_id) = ANY(string_to_array(${competitorId}, ',')::int[]))
      AND (${destinationId}::text IS NULL OR oc.destination_id = ANY(string_to_array(${destinationId}, ',')::int[]))
      AND (${source}::text IS NULL OR CASE WHEN a.marketing_offer_id IS NOT NULL THEN 'marketing' ELSE 'offers' END = ${source})
      AND (${search}::text IS NULL OR a.message ILIKE ${`%${search ?? ""}%`} OR c.name ILIKE ${`%${search ?? ""}%`})
      AND (${status}::text IS NULL OR
        (${status} = 'new' AND a.type = 'new_offer') OR
        (${status} = 'changed' AND a.type = 'updated_offer') OR
        (${status} = 'removed' AND a.type = 'removed_offer'))
    ORDER BY a.created_at DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `);
  const totalRows = await db.execute(sql<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM alerts a
    LEFT JOIN scraped_offers o ON o.id = a.offer_id
    LEFT JOIN marketing_offers mo ON mo.id = a.marketing_offer_id
    LEFT JOIN competitors c ON c.id = COALESCE(o.competitor_id, mo.competitor_id)
    LEFT JOIN offer_classification oc ON oc.offer_id = o.id
    WHERE (${competitorId}::text IS NULL OR COALESCE(o.competitor_id, mo.competitor_id) = ANY(string_to_array(${competitorId}, ',')::int[]))
      AND (${destinationId}::text IS NULL OR oc.destination_id = ANY(string_to_array(${destinationId}, ',')::int[]))
      AND (${source}::text IS NULL OR CASE WHEN a.marketing_offer_id IS NOT NULL THEN 'marketing' ELSE 'offers' END = ${source})
      AND (${search}::text IS NULL OR a.message ILIKE ${`%${search ?? ""}%`} OR c.name ILIKE ${`%${search ?? ""}%`})
      AND (${status}::text IS NULL OR
        (${status} = 'new' AND a.type = 'new_offer') OR
        (${status} = 'changed' AND a.type = 'updated_offer') OR
        (${status} = 'removed' AND a.type = 'removed_offer'))
  `);
  const total = Number(totalRows[0]?.count ?? 0);

  return {
    alerts: rows.map((row) => ({
      id: String(row.id),
      offerId: row.offer_id ? String(row.offer_id) : null,
      type: toNotificationType(row.type),
      statusFilter: row.type === "updated_offer" ? "changed" : row.type === "removed_offer" ? "removed" : "new",
      source: toNotificationSource(row.source),
      competitorId: row.competitor_id ? String(row.competitor_id) : null,
      competitorName: String(row.competitor_name ?? ""),
      destinationId: row.destination_id ? String(row.destination_id) : null,
      destinationName: row.destination_name ? String(row.destination_name) : null,
      message: String(row.message ?? ""),
      createdAt: toIsoString(row.created_at) ?? new Date(0).toISOString(),
      isRead: false,
      previewImage: row.image_url ? String(row.image_url) : null,
      deepLinkUrl: row.offer_url ? String(row.offer_url) : null,
      priceText: row.price_text ? String(row.price_text) : null,
      currentStatus: row.current_status ? toLifecycleStatus(row.current_status) : null,
    })),
    unreadCount: total,
    totalCount: total,
    hasNextPage: page * limit < total,
  };
}

export function parseJobRunRequest(body: unknown): JobRunRequest {
  const candidate = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const module = candidate.module;
  const competitorSlug = candidate.competitorSlug;

  if (module !== "ads" && module !== "offers" && module !== "marketing") {
    throw new Error("Invalid module.");
  }

  return {
    module,
    competitorSlug: typeof competitorSlug === "string" && competitorSlug ? competitorSlug : undefined,
  };
}
