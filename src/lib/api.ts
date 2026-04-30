import type { Snapshot } from "@/types/snapshot";

const ADS_ENDPOINT = "/api/ads";
const ADS_SUMMARY_ENDPOINT = "/api/ads/summary";
const COMPETITORS_ENDPOINT = "/api/competitors";
const DESTINATIONS_ENDPOINT = "/api/destinations";
const OFFERS_ENDPOINT = "/api/offers";
const OFFERS_SUMMARY_ENDPOINT = "/api/offers/summary";
const MARKETING_OFFERS_ENDPOINT = "/api/marketing-offers";

export interface AdsFilters {
  status?: string;
  competitor_id?: string;
  destination_id?: string;
  country?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export interface AdsSummaryFilters {
  competitorId?: string;
  destinationId?: string;
  status?: string;
  country?: string;
  search?: string;
}

export interface AdsSummaryResponse {
  totalAds: number;
  newAds: number;
  activeAds: number;
  removedAds: number;
  changedAds: number;
}

export type OfferStatus = "new" | "active" | "removed" | "changed";

export interface OfferRecord {
  id: number;
  external_id: string;
  offer_title: string;
  offer_url: string;
  price_numeric: string | null;
  currency: string;
  price_text: string;
  duration_days: number;
  departure_date: string;
  image_url: string;
  description: string;
  created_at: string;
  status: OfferStatus;
  status_updated_at: string;
  competitor_name: string;
  destination_name: string;
  destination_country: string;
  destination_id: number;
}

export interface OffersResponse {
  offers: OfferRecord[];
  pagination?: {
    total?: number;
  };
}

export interface MarketingOfferRecord {
  id: number;
  title: string;
  description: string;
  url: string;
  cta_text: string;
  validity: string;
  raw_text: string;
  created_at: string;
  detected_at: string;
  competitor_id: number;
  competitor_name: string;
}

export interface MarketingOffersResponse {
  offers: MarketingOfferRecord[];
  pagination?: {
    total?: number;
  };
}

export interface FilterOption {
  id: string;
  label: string;
}

export interface CompetitorFilterOption extends FilterOption {
  capabilities?: Array<{
    module: "ads" | "offers" | "marketing";
    state: "enabled" | "in_progress" | "blocked";
    note: string | null;
  }>;
}

const toSafeNumber = (value: unknown): number => {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const makeQueryString = (filters: object) => {
  const params = new URLSearchParams();
  Object.entries(filters as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  return params.toString();
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

const isOfferStatus = (value: unknown): value is OfferStatus =>
  value === "new" || value === "active" || value === "removed" || value === "changed";

export async function getCompetitors(): Promise<CompetitorFilterOption[]> {
  const payload = await fetchJson<
    Array<{
      id: number;
      name: string;
      capabilities?: CompetitorFilterOption["capabilities"];
    }>
  >(COMPETITORS_ENDPOINT);

  return payload.map((item) => ({
    id: String(item.id),
    label: item.name,
    capabilities: item.capabilities ?? [],
  }));
}

export async function getDestinations(): Promise<FilterOption[]> {
  const payload = await fetchJson<Array<{ id: number; name: string }>>(DESTINATIONS_ENDPOINT);
  return payload.map((item) => ({
    id: String(item.id),
    label: item.name,
  }));
}

export async function getAds(filters: AdsFilters): Promise<Snapshot> {
  const query = makeQueryString(filters);
  const payload = await fetchJson<{
    ads: Array<{
      id: number;
      creativeId: string;
      competitorId: number;
      destinationId: number | null;
      destinationName: string | null;
      destinationCountry: string | null;
      format: string | null;
      firstSeenGlobal: string | null;
      lastSeenGlobal: string | null;
      status: "new" | "active" | "removed" | "changed";
      statusUpdatedAt: string | null;
      becameNewDate: string | null;
      changedDate: string | null;
      becameRemovedDate: string | null;
      snapshotDate: string | null;
      imageUrl: string | null;
      videoUrl: string | null;
      regions?: unknown;
      media?: {
        image?: {
          url: string;
          width: number | null;
          height: number | null;
        } | null;
        video?: {
          previewUrl: string | null;
          previewImageUrl: string | null;
        } | null;
      };
      transparencyUrl: string | null;
      metadata: Record<string, unknown> | null;
    }>;
    pagination?: { total?: number };
  }>(query ? `${ADS_ENDPOINT}?${query}` : ADS_ENDPOINT);

  return {
    current_ads: payload.ads.map((ad) => ({
      id: String(ad.id),
      creative_id: ad.creativeId,
      advertiser_id: null,
      competitor_id: String(ad.competitorId),
      destination_id: ad.destinationId ? String(ad.destinationId) : null,
      destination_name: ad.destinationName,
      destination_country: ad.destinationCountry,
      title: null,
      snippet: null,
      url: ad.transparencyUrl,
      image: ad.imageUrl,
      images: ad.imageUrl ? [ad.imageUrl] : [],
      video: ad.videoUrl,
      videos: ad.videoUrl ? [ad.videoUrl] : [],
      regions: ad.regions ?? ad.metadata?.regions ?? ad.metadata?.ad_information ?? null,
      metadata: ad.metadata,
      snapshot_date: ad.snapshotDate,
      status_updated_at: ad.statusUpdatedAt,
      region: null,
      format: ad.format,
      media: {
        images: ad.imageUrl ? [ad.imageUrl] : [],
        videos: ad.videoUrl ? [ad.videoUrl] : [],
        image: ad.media?.image ?? null,
        video: ad.media?.video ?? null,
      },
      first_seen: ad.firstSeenGlobal,
      last_seen: ad.lastSeenGlobal,
      status: ad.status,
      became_new_date: ad.becameNewDate,
      changed_date: ad.changedDate,
      removed_date: ad.becameRemovedDate,
      became_removed_date: ad.becameRemovedDate,
      last_seen_global: ad.lastSeenGlobal,
    })),
    pagination: {
      total: typeof payload.pagination?.total === "number" ? payload.pagination.total : undefined,
    },
  };
}

export async function getAdsSummary(
  filters: AdsSummaryFilters = {},
): Promise<AdsSummaryResponse> {
  const query = makeQueryString({
    competitor_id: filters.competitorId,
    destination_id: filters.destinationId,
    status: filters.status,
    country: filters.country,
    search: filters.search,
  });

  return fetchJson<AdsSummaryResponse>(
    query ? `${ADS_SUMMARY_ENDPOINT}?${query}` : ADS_SUMMARY_ENDPOINT,
  );
}

export async function getOffers(filters: AdsFilters): Promise<OffersResponse> {
  const query = makeQueryString(filters);
  const payload = await fetchJson<{
    offers: Array<{
      id: number;
      externalId: string;
      offerTitle: string;
      offerUrl: string;
      priceNumeric: string | null;
      currency: string;
      priceText: string;
      durationDays: number | null;
      departureDate: string | null;
      imageUrl: string | null;
      description: string | null;
      createdAt: string;
      status: string;
      statusUpdatedAt: string | null;
      competitorName: string;
      destinationName: string | null;
      destinationCountry: string | null;
      destinationId: number | null;
    }>;
    pagination?: { total?: number };
  }>(query ? `${OFFERS_ENDPOINT}?${query}` : OFFERS_ENDPOINT);

  return {
    offers: payload.offers.map((item) => ({
      id: item.id,
      external_id: item.externalId,
      offer_title: item.offerTitle,
      offer_url: item.offerUrl,
      price_numeric: item.priceNumeric,
      currency: item.currency,
      price_text: item.priceText,
      duration_days: item.durationDays ?? 0,
      departure_date: item.departureDate ?? "",
      image_url: item.imageUrl ?? "",
      description: item.description ?? "",
      created_at: item.createdAt,
      status: isOfferStatus(item.status) ? item.status : "active",
      status_updated_at: item.statusUpdatedAt ?? "",
      competitor_name: item.competitorName,
      destination_name: item.destinationName ?? "",
      destination_country: item.destinationCountry ?? "",
      destination_id: item.destinationId ?? 0,
    })),
    pagination: {
      total: typeof payload.pagination?.total === "number" ? payload.pagination.total : undefined,
    },
  };
}

export async function getOffersSummary(filters: AdsFilters = {}): Promise<AdsSummaryResponse> {
  const query = makeQueryString({
    competitor_id: filters.competitor_id,
    destination_id: filters.destination_id,
    status: filters.status,
    search: filters.search,
  });
  const payload = await fetchJson<{
    totalOffers: number;
    newOffers: number;
    activeOffers: number;
    removedOffers: number;
    changedOffers: number;
  }>(query ? `${OFFERS_SUMMARY_ENDPOINT}?${query}` : OFFERS_SUMMARY_ENDPOINT);

  return {
    totalAds: payload.totalOffers,
    newAds: payload.newOffers,
    activeAds: payload.activeOffers,
    removedAds: payload.removedOffers,
    changedAds: payload.changedOffers,
  };
}

export async function getMarketingOffers(filters: AdsFilters): Promise<MarketingOffersResponse> {
  const query = makeQueryString(filters);
  const payload = await fetchJson<{
    offers: Array<{
      id: number;
      title: string;
      description: string | null;
      url: string | null;
      ctaText: string | null;
      validity: string | null;
      rawText: string | null;
      createdAt: string;
      detectedAt: string;
      competitorId: number;
      competitorName: string;
    }>;
    pagination?: { total?: number };
  }>(query ? `${MARKETING_OFFERS_ENDPOINT}?${query}` : MARKETING_OFFERS_ENDPOINT);

  return {
    offers: payload.offers.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description ?? "",
      url: item.url ?? "",
      cta_text: item.ctaText ?? "",
      validity: item.validity ?? "",
      raw_text: item.rawText ?? "",
      created_at: item.createdAt,
      detected_at: item.detectedAt,
      competitor_id: item.competitorId,
      competitor_name: item.competitorName,
    })),
    pagination: {
      total: typeof payload.pagination?.total === "number" ? payload.pagination.total : undefined,
    },
  };
}

export function getModuleAnnotation(
  competitor: CompetitorFilterOption,
  module: "ads" | "offers" | "marketing",
): string | undefined {
  const capability = competitor.capabilities?.find((item) => item.module === module);
  if (!capability || capability.state === "enabled") {
    return undefined;
  }

  return capability.note ?? capability.state.replace("_", " ");
}

export const toPaginationTotal = (value: unknown): number | undefined => {
  const total = toSafeNumber(value);
  return total > 0 ? total : undefined;
};
