import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  AdRecord,
  AdsSummaryResponse,
  CapabilityState,
  CompetitorCapability,
  CompetitorDto,
  DestinationDto,
  LifecycleStatus,
  MarketingOfferRecord,
  NotificationItem,
  NotificationSource,
  OfferRecord,
  PaginationMeta,
} from "@olympic/contracts";
import { capabilitySeed, competitorSeed, destinationSeed, keywordSeed } from "@olympic/db";

interface ScrapeRunSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  searchWindow: {
    fromDate: string;
    toDate: string;
    adults: number;
    rooms: number;
    nights: number;
    timezone: string;
  };
  results: Array<{
    competitor: string;
    capability: "promotions" | "live-prices";
    status: "success" | "partial" | "blocked" | "failed";
    method: string;
    notes: string[];
    blockers: Array<{ reason: string; message: string }>;
    records: Array<Record<string, unknown>>;
  }>;
}

interface AdsArtifactSummary {
  runId: string;
  finishedAt: string;
  locationName: string;
  platform: string;
  results: Array<{
    competitorSlug: string;
    competitorName: string;
    status: "success" | "partial" | "blocked" | "failed";
    notes: string[];
    blockers: Array<{ code: string; message: string }>;
    records: Array<{
      competitorSlug: string;
      competitorName: string;
      competitorId: number;
      advertiserId: string;
      creativeId: string;
      transparencyUrl: string;
      format: string;
      previewImageUrl: string | null;
      previewImageWidth?: number | null;
      previewImageHeight?: number | null;
      firstShown: string | null;
      lastShown: string | null;
      destinationId: number | null;
      destinationName: string | null;
      destinationCountry: string | null;
      confidenceScore: number | null;
      rawData: Record<string, unknown>;
      target: string;
      verified: boolean;
    }>;
  }>;
}

interface DemoStore {
  competitors: CompetitorDto[];
  destinations: DestinationDto[];
  ads: AdRecord[];
  offers: OfferRecord[];
  marketingOffers: MarketingOfferRecord[];
  alerts: NotificationItem[];
  adsSummary: AdsSummaryResponse;
  offersSummary: {
    totalOffers: number;
    newOffers: number;
    activeOffers: number;
    removedOffers: number;
    changedOffers: number;
  };
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function toStatus(status: string): LifecycleStatus {
  if (status === "new" || status === "active" || status === "removed" || status === "changed") {
    return status;
  }

  return "new";
}

function paginate<T>(items: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);
  const pagination: PaginationMeta = {
    total: items.length,
    page,
    limit,
    hasNextPage: start + limit < items.length,
  };

  return { items: paged, pagination };
}

function destinationLookup(text: string | null | undefined) {
  const haystack = normalize(text);

  if (!haystack) return null;

  let best: DestinationDto | null = null;
  let bestScore = 0;

  for (const keyword of keywordSeed) {
    if (!keyword.destinationId) continue;
    const needle = normalize(keyword.keyword);
    if (!needle) continue;

    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(needle).replace(/\s+/g, "\\s+")}([^a-z0-9]|$)`, "g");
    const matches = [...haystack.matchAll(pattern)];
    if (matches.length === 0) continue;

    const destination = destinationSeed.find((item) => item.id === keyword.destinationId);
    const score = matches.length * 100 + needle.length;

    if (destination && score > bestScore) {
      best = destination;
      bestScore = score;
    }
  }

  return best;
}

function capabilityStateForResult(
  status: "success" | "partial" | "blocked" | "failed" | undefined,
): CapabilityState {
  if (status === "success") return "enabled";
  if (status === "partial") return "in_progress";
  return "blocked";
}

async function readLatestScrapeSummary(): Promise<ScrapeRunSummary | null> {
  try {
    const filePath = path.join(process.cwd(), "runs", "latest.json");
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as ScrapeRunSummary;
  } catch {
    return null;
  }
}

async function readLatestAdsSummary(): Promise<AdsArtifactSummary | null> {
  try {
    const filePath = path.join(process.cwd(), "runs", "ads", "latest.json");
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as AdsArtifactSummary;
  } catch {
    return null;
  }
}

function createCompetitors(summary: ScrapeRunSummary | null, adsSummary: AdsArtifactSummary | null): CompetitorDto[] {
  return competitorSeed.map((competitor) => {
    const results = summary?.results.filter((item) => item.competitor === competitor.slug) ?? [];
    const promotions = results.find((item) => item.capability === "promotions");
    const livePrices = results.find((item) => item.capability === "live-prices");
    const adsResult = adsSummary?.results.find((item) => item.competitorSlug === competitor.slug);
    const seedCapabilities = capabilitySeed.filter((item) => item.competitorId === competitor.id);

    const capabilities: CompetitorCapability[] = seedCapabilities.map((seedItem) => {
      const sourceResult =
        seedItem.module === "marketing"
          ? promotions
          : seedItem.module === "offers"
            ? livePrices
            : adsResult;

      if (!sourceResult) {
        return {
          module: seedItem.module,
          state: seedItem.state,
          note: seedItem.note,
        };
      }

      return {
        module: seedItem.module,
        state: capabilityStateForResult(sourceResult.status),
        note:
          sourceResult.blockers.map((item) => item.message).join(" ") ||
          sourceResult.notes.join(" ") ||
          seedItem.note,
      };
    });

    return {
      id: competitor.id,
      slug: competitor.slug,
      name: competitor.name,
      websiteUrl: competitor.websiteUrl,
      capabilities,
    };
  });
}

function createOffers(summary: ScrapeRunSummary | null): OfferRecord[] {
  if (!summary) return [];

  return summary.results
    .filter((result) => result.capability === "live-prices")
    .flatMap((result) => {
      const competitor = competitorSeed.find((item) => item.slug === result.competitor);
      if (!competitor) return [];

      return result.records.map((record, index) => {
        const propertyName = String(record.propertyName ?? `Offer ${index + 1}`);
        const offerUrl = String(record.sourceUrl ?? competitor.websiteUrl);
        const destination = destinationLookup(
          [record.destination, record.propertyName, record.sourceUrl].filter(Boolean).join(" "),
        );
        const externalId = createHash("md5")
          .update(`${competitor.slug}:${propertyName}:${offerUrl}:${record.travelDate ?? ""}`)
          .digest("hex");

        return {
          id: Number(`${competitor.id}${index + 1}`),
          externalId,
          offerTitle: propertyName,
          offerUrl,
          priceNumeric:
            typeof record.priceText === "string"
              ? record.priceText.replace(/[^\d.]/g, "") || null
              : null,
          currency: String(record.currency ?? "GBP"),
          priceText: String(record.priceText ?? ""),
          durationDays:
            typeof record.nights === "string"
              ? Number.parseInt(record.nights.replace(/[^\d]/g, ""), 10) || null
              : null,
          departureDate:
            typeof record.travelDate === "string" && record.travelDate
              ? new Date(record.travelDate).toISOString().slice(0, 10)
              : null,
          imageUrl: typeof record.imageUrl === "string" && record.imageUrl ? record.imageUrl : null,
          description: `Captured from ${competitor.name} scrape run.`,
          createdAt: String(record.collectedAt ?? summary.finishedAt),
          status: result.status === "blocked" ? "removed" : "new",
          statusUpdatedAt: summary.finishedAt,
          competitorId: competitor.id,
          competitorName: competitor.name,
          destinationId: destination?.id ?? null,
          destinationName: destination?.name ?? null,
          destinationCountry: destination?.country ?? null,
        } satisfies OfferRecord;
      });
    });
}

function createMarketingOffers(summary: ScrapeRunSummary | null): MarketingOfferRecord[] {
  if (!summary) return [];

  return summary.results
    .filter((result) => result.capability === "promotions")
    .flatMap((result) => {
      const competitor = competitorSeed.find((item) => item.slug === result.competitor);
      if (!competitor) return [];

      return result.records.map((record, index) => ({
        id: Number(`${competitor.id}${index + 101}`),
        title: String(record.title ?? `Promotion ${index + 1}`),
        description: typeof record.subtitle === "string" ? record.subtitle : null,
        url: typeof record.sourceUrl === "string" ? record.sourceUrl : null,
        ctaText: null,
        validity: null,
        rawText: [
          record.title,
          record.subtitle,
          record.priceText,
          record.discountText,
          record.destinationText,
        ]
          .filter(Boolean)
          .join(" "),
        createdAt: String(record.collectedAt ?? summary.finishedAt),
        detectedAt: String(record.collectedAt ?? summary.finishedAt),
        competitorId: competitor.id,
        competitorName: competitor.name,
      }));
    });
}

function createAlerts(offers: OfferRecord[], marketingOffers: MarketingOfferRecord[]): NotificationItem[] {
  const offerAlerts: NotificationItem[] = offers.map((offer) => ({
    id: `offer-${offer.id}`,
    offerId: String(offer.id),
    type: "new_offer",
    statusFilter: "new",
    source: "offers",
    competitorId: String(offer.competitorId),
    competitorName: offer.competitorName,
    destinationId: offer.destinationId ? String(offer.destinationId) : null,
    destinationName: offer.destinationName,
    message: `Offer "${offer.offerTitle}" is new`,
    createdAt: offer.createdAt,
    isRead: false,
    previewImage: offer.imageUrl,
    deepLinkUrl: offer.offerUrl,
    priceText: offer.priceText,
    currentStatus: offer.status,
  }));

  const marketingAlerts: NotificationItem[] = marketingOffers.map((offer) => ({
    id: `marketing-${offer.id}`,
    offerId: String(offer.id),
    type: "new_offer",
    statusFilter: "new",
    source: "marketing" satisfies NotificationSource,
    competitorId: String(offer.competitorId),
    competitorName: offer.competitorName,
    destinationId: null,
    destinationName: null,
    message: `Marketing offer "${offer.title}" is new`,
    createdAt: offer.createdAt,
    isRead: false,
    previewImage: null,
    deepLinkUrl: offer.url,
    priceText: null,
    currentStatus: "new",
  }));

  return [...offerAlerts, ...marketingAlerts].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function createAds(artifact: AdsArtifactSummary | null): { ads: AdRecord[]; summary: AdsSummaryResponse } {
  if (!artifact) {
    return {
      ads: [],
      summary: {
        totalAds: 0,
        newAds: 0,
        activeAds: 0,
        removedAds: 0,
        changedAds: 0,
      },
    };
  }

  const ads = artifact.results.flatMap((result, resultIndex) =>
    result.records.map((record, recordIndex) => ({
      id: Number(`${record.competitorId}${resultIndex}${recordIndex + 1}`),
      creativeId: record.creativeId,
      competitorId: record.competitorId,
      competitorName: record.competitorName,
      destinationId: record.destinationId,
      destinationName: record.destinationName,
      destinationCountry: record.destinationCountry,
      format: record.format,
      firstSeenGlobal: record.firstShown,
      lastSeenGlobal: record.lastShown,
      status: "active" as LifecycleStatus,
      statusUpdatedAt: artifact.finishedAt,
      becameNewDate: null,
      changedDate: null,
      becameRemovedDate: null,
      snapshotDate: artifact.finishedAt.slice(0, 10),
      imageUrl: record.previewImageUrl,
      videoUrl: null,
      media: {
        image: record.previewImageUrl
          ? {
              url: record.previewImageUrl,
              width: record.previewImageWidth ?? null,
              height: record.previewImageHeight ?? null,
            }
          : null,
        video: null,
      },
      transparencyUrl: record.transparencyUrl,
      metadata: {
        advertiserId: record.advertiserId,
        target: record.target,
        verified: record.verified,
        confidenceScore: record.confidenceScore,
        rawData: record.rawData,
      },
    })),
  );

  return {
    ads,
    summary: {
      totalAds: ads.length,
      newAds: 0,
      activeAds: ads.length,
      removedAds: 0,
      changedAds: 0,
    },
  };
}

function createOffersSummary(offers: OfferRecord[]) {
  return {
    totalOffers: offers.length,
    newOffers: offers.filter((offer) => offer.status === "new").length,
    activeOffers: offers.filter((offer) => offer.status === "active").length,
    removedOffers: offers.filter((offer) => offer.status === "removed").length,
    changedOffers: offers.filter((offer) => offer.status === "changed").length,
  };
}

export async function loadDemoStore(): Promise<DemoStore> {
  const summary = await readLatestScrapeSummary();
  const adsSummary = await readLatestAdsSummary();
  const competitors = createCompetitors(summary, adsSummary);
  const destinations = destinationSeed.map((item) => ({ ...item }));
  const offers = createOffers(summary);
  const marketingOffers = createMarketingOffers(summary);
  const alerts = createAlerts(offers, marketingOffers);
  const ads = createAds(adsSummary);

  return {
    competitors,
    destinations,
    ads: ads.ads,
    offers,
    marketingOffers,
    alerts,
    adsSummary: ads.summary,
    offersSummary: createOffersSummary(offers),
  };
}

export function filterBySearch<T>(items: T[], search: string | undefined, textSelector: (item: T) => string) {
  const needle = normalize(search);

  if (!needle) return items;

  return items.filter((item) => normalize(textSelector(item)).includes(needle));
}

export function filterByIds<T>(
  items: T[],
  rawIds: string | undefined,
  getId: (item: T) => number | null | undefined,
) {
  if (!rawIds) return items;

  const ids = rawIds
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (ids.length === 0) return items;

  return items.filter((item) => {
    const id = getId(item);
    return id !== null && id !== undefined && ids.includes(String(id));
  });
}

export function sortByField<T extends object>(
  items: T[],
  field: string | undefined,
  order: "asc" | "desc" = "desc",
  fallbackField: keyof T,
) {
  const sortField = (field && field in (items[0] ?? {}) ? field : fallbackField) as keyof T;

  return [...items].sort((left, right) => {
    const a = (left as Record<string, unknown>)[String(sortField)];
    const b = (right as Record<string, unknown>)[String(sortField)];
    const valueA = typeof a === "number" ? a : String(a ?? "");
    const valueB = typeof b === "number" ? b : String(b ?? "");

    if (valueA < valueB) return order === "asc" ? -1 : 1;
    if (valueA > valueB) return order === "asc" ? 1 : -1;
    return 0;
  });
}

export { paginate, slugify };
