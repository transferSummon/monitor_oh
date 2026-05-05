export type LifecycleStatus = "new" | "active" | "removed" | "changed";
export type NotificationType = "new_offer" | "updated_offer" | "removed_offer";
export type NotificationSource = "offers" | "marketing";
export type CompetitorModule = "ads" | "offers" | "marketing";
export type CapabilityState = "enabled" | "in_progress" | "blocked";

export interface CompetitorCapability {
  module: CompetitorModule;
  state: CapabilityState;
  note: string | null;
}

export interface CompetitorDto {
  id: number;
  slug: string;
  name: string;
  websiteUrl: string;
  capabilities: CompetitorCapability[];
}

export interface DestinationDto {
  id: number;
  name: string;
  country: string;
  slug: string | null;
  parentId: number | null;
  destinationType: string;
  isOlympic: boolean;
  sortOrder: number | null;
}

export interface DestinationAssignmentDto {
  id: number;
  name: string;
  country: string;
  slug: string | null;
  parentId: number | null;
  destinationType: string;
  role: "primary" | "matched" | "rollup";
  confidenceScore: number | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}

export interface AdRecord {
  id: number;
  creativeId: string;
  competitorId: number;
  competitorName: string;
  destinationId: number | null;
  destinationName: string | null;
  destinationCountry: string | null;
  destinations: DestinationAssignmentDto[];
  format: string | null;
  firstSeenGlobal: string | null;
  lastSeenGlobal: string | null;
  status: LifecycleStatus;
  statusUpdatedAt: string | null;
  becameNewDate: string | null;
  changedDate: string | null;
  becameRemovedDate: string | null;
  snapshotDate: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  regions?: unknown;
  media: {
    image: {
      url: string;
      width: number | null;
      height: number | null;
    } | null;
    video: {
      previewUrl: string | null;
      previewImageUrl: string | null;
    } | null;
  };
  transparencyUrl: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AdsResponse {
  ads: AdRecord[];
  pagination: PaginationMeta;
}

export interface AdsSummaryResponse {
  totalAds: number;
  newAds: number;
  activeAds: number;
  removedAds: number;
  removedAdsLast7Days?: number;
  changedAds: number;
}

export interface OfferRecord {
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
  status: LifecycleStatus;
  statusUpdatedAt: string | null;
  competitorId: number;
  competitorName: string;
  destinationId: number | null;
  destinationName: string | null;
  destinationCountry: string | null;
  destinations: DestinationAssignmentDto[];
}

export interface OffersResponse {
  offers: OfferRecord[];
  pagination: PaginationMeta;
}

export interface OffersSummaryResponse {
  totalOffers: number;
  newOffers: number;
  activeOffers: number;
  removedOffers: number;
  removedOffersLast7Days?: number;
  changedOffers: number;
}

export interface MarketingOfferRecord {
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
}

export interface MarketingOffersResponse {
  offers: MarketingOfferRecord[];
  pagination: PaginationMeta;
}

export interface NotificationItem {
  id: string;
  offerId: string | null;
  type: NotificationType;
  statusFilter: Extract<LifecycleStatus, "new" | "removed" | "changed">;
  source: NotificationSource;
  competitorId: string | null;
  competitorName: string;
  destinationId: string | null;
  destinationName: string | null;
  destinations: DestinationAssignmentDto[];
  message: string;
  createdAt: string;
  isRead: boolean;
  previewImage: string | null;
  deepLinkUrl: string | null;
  priceText: string | null;
  currentStatus: LifecycleStatus | null;
}

export interface NotificationsResponse {
  alerts: NotificationItem[];
  unreadCount: number;
  totalCount: number;
  hasNextPage: boolean;
}

export interface ListFilters {
  status?: LifecycleStatus;
  competitorId?: string;
  destinationId?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export interface JobRunRequest {
  module: CompetitorModule;
  competitorSlug?: string;
}

export type JobRunStatus = "success" | "partial" | "blocked" | "failed";

export interface JobRunResponse {
  ok: boolean;
  module: CompetitorModule;
  status: JobRunStatus;
  competitorSlug: string | null;
  message: string;
  runId: string | null;
  counts: Record<string, number>;
}
