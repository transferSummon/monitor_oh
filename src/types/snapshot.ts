export interface AdSummary {
  total_ads: number;
  new_ads?: number;
  active_ads?: number;
  removed_ads?: number;
  changed_ads?: number;
}

export interface CreativeRecord {
  id?: string | null;
  creative_id: string;
  advertiser_id: string | null;
  competitor_id?: string | null;
  destination_id?: string | null;
  destination_name?: string | null;
  destination_country?: string | null;
  destinations?: Array<{
    id: number;
    name: string;
    country: string;
    slug: string | null;
    parentId: number | null;
    destinationType: string;
    role: "primary" | "matched" | "rollup";
    confidenceScore: number | null;
  }>;
  title: string | null;
  snippet: string | null;
  url: string | null;
  image?: string | null;
  images?: unknown;
  video?: string | null;
  videos?: unknown[] | string | null;
  regions?: unknown;
  metadata?: Record<string, unknown> | null;
  snapshot_date?: string | null;
  status_updated_at?: string | null;
  region: string | null;
  format: string | null;
  media: {
    images: unknown[];
    videos: unknown[];
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
  first_seen: string | null;
  last_seen: string | null;
  status?: "new" | "active" | "removed" | "changed" | string | null;
  became_new_date?: string | null;
  changed_date?: string | null;
  removed_date?: string | null;
  became_removed_date?: string | null;
  last_seen_global?: string | null;
}

export interface Snapshot {
  summary?: AdSummary;
  current_ads?: CreativeRecord[];
  active?: CreativeRecord[];
  new?: CreativeRecord[];
  added?: CreativeRecord[];
  removed?: CreativeRecord[];
  changed?: CreativeRecord[];
  pagination?: {
    total?: number;
  };
}
