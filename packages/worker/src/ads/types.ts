import type { CompetitorSlug } from "scraper-engine";

export interface NormalizedDestinationAssignment {
  destinationId: number;
  role: "primary" | "matched" | "rollup";
}

export interface DataForSeoAdsSearchItem {
  type: string;
  rank_group: number;
  rank_absolute: number;
  advertiser_id: string;
  creative_id: string;
  title: string;
  url: string;
  verified: boolean;
  format: string;
  preview_image?: {
    url?: string;
    height?: number;
    width?: number;
  } | null;
  preview_url?: string | null;
  first_shown?: string | null;
  last_shown?: string | null;
}

export interface NormalizedAdRecord {
  competitorSlug: CompetitorSlug;
  competitorName: string;
  competitorId: number;
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
  ocrText: string | null;
  ocrAttempted: boolean;
  ocrSourceUrl: string | null;
  ocrError: string | null;
  destinationId: number | null;
  destinationName: string | null;
  destinationCountry: string | null;
  destinationAssignments: NormalizedDestinationAssignment[];
  confidenceScore: number | null;
  snapshotHash: string;
  rawData: Record<string, unknown>;
}

export interface AdsArtifactResult {
  competitorSlug: CompetitorSlug;
  competitorName: string;
  status: "success" | "partial" | "blocked" | "failed";
  notes: string[];
  blockers: Array<{ code: string; message: string }>;
  records: NormalizedAdRecord[];
}

export interface AdsArtifactSummary {
  runId: string;
  finishedAt: string;
  locationName: string;
  platform: string;
  results: AdsArtifactResult[];
}
