"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import {
  getAds,
  getAdsSummary,
  getCompetitors,
  getDestinations,
  getModuleAnnotation,
  type AdsFilters,
  type AdsSummaryResponse,
} from "@/lib/api";
import type { CreativeRecord, Snapshot } from "@/types/snapshot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AdsList } from "./AdsList";
import { ErrorState } from "./ErrorState";
import { FilterBar } from "./FilterBar";
import { DashboardSkeleton as LoadingSkeleton } from "./LoadingSkeleton";
import { SummaryCards } from "./SummaryCards";

const PAGE_LIMIT = 200;

type StatusTab = "all" | "new" | "active" | "removed" | "changed";

type AdsResponse = Snapshot & {
  pagination?: {
    total?: number;
  };
  ads?: unknown[];
  data?: unknown[];
  items?: unknown[];
  results?: unknown[];
};

const normalizeMedia = (imagesValue: unknown, videosValue: unknown) => {
  const toArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const candidate = obj.image ?? obj.images ?? obj.url ?? obj.src;
      if (typeof candidate === "string") return [candidate];
      if (Array.isArray(candidate)) {
        return candidate.filter((item): item is string => typeof item === "string");
      }
    }
    if (typeof value === "string") return [value];
    return [];
  };

  return {
    images: toArray(imagesValue),
    videos: toArray(videosValue),
  };
};

const mapRaw = (ad: Record<string, unknown>): CreativeRecord => {
  const region =
    typeof ad.region === "string"
      ? ad.region
      : typeof ad.regions === "string"
        ? ad.regions
        : null;

  const media = normalizeMedia(
    (ad.media as { images?: unknown } | undefined)?.images ?? ad.images,
    (ad.media as { videos?: unknown } | undefined)?.videos ?? ad.videos,
  );
  const mediaObject = ad.media && typeof ad.media === "object" ? (ad.media as Record<string, unknown>) : null;
  const mediaImage =
    mediaObject?.image && typeof mediaObject.image === "object"
      ? (mediaObject.image as CreativeRecord["media"]["image"])
      : null;
  const mediaVideo =
    mediaObject?.video && typeof mediaObject.video === "object"
      ? (mediaObject.video as CreativeRecord["media"]["video"])
      : null;

  const advertiserId = typeof ad.advertiser_id === "string" ? ad.advertiser_id : null;
  const creativeId = typeof ad.creative_id === "string" ? ad.creative_id : "";

  return {
    id:
      typeof ad.id === "string" || typeof ad.id === "number" ? String(ad.id) : null,
    creative_id: creativeId,
    advertiser_id: advertiserId,
    competitor_id:
      typeof ad.competitor_id === "string" || typeof ad.competitor_id === "number"
        ? String(ad.competitor_id)
        : null,
    destination_id:
      typeof ad.destination_id === "string" || typeof ad.destination_id === "number"
        ? String(ad.destination_id)
        : null,
    destination_name:
      typeof ad.destination_name === "string" ? ad.destination_name : null,
    destination_country:
      typeof ad.destination_country === "string" ? ad.destination_country : null,
    destinations: Array.isArray(ad.destinations)
      ? (ad.destinations as CreativeRecord["destinations"])
      : [],
    title: typeof ad.title === "string" ? ad.title : null,
    snippet: typeof ad.snippet === "string" ? ad.snippet : null,
    url: typeof ad.url === "string" ? ad.url : null,
    image: typeof ad.image === "string" ? ad.image : null,
    images: ad.images,
    video: typeof ad.video === "string" ? ad.video : null,
    videos:
      Array.isArray(ad.videos) || typeof ad.videos === "string" ? ad.videos : null,
    regions: ad.regions,
    metadata:
      ad.metadata && typeof ad.metadata === "object"
        ? (ad.metadata as Record<string, unknown>)
        : null,
    snapshot_date: typeof ad.snapshot_date === "string" ? ad.snapshot_date : null,
    region,
    format:
      typeof ad.format === "string"
        ? ad.format
        : typeof ad.media_format === "string"
          ? ad.media_format
          : null,
    media: {
      ...media,
      image: mediaImage,
      video: mediaVideo,
    },
    first_seen:
      typeof ad.first_seen === "string"
        ? ad.first_seen
        : typeof ad.first_seen_api === "string"
          ? ad.first_seen_api
          : typeof ad.became_new_date === "string"
            ? ad.became_new_date
            : null,
    last_seen:
      typeof ad.last_seen === "string"
        ? ad.last_seen
        : typeof ad.last_seen_api === "string"
          ? ad.last_seen_api
          : typeof ad.snapshot_date === "string"
            ? ad.snapshot_date
            : null,
    status: typeof ad.status === "string" ? ad.status : null,
    status_updated_at:
      typeof ad.status_updated_at === "string" ? ad.status_updated_at : null,
    became_new_date:
      typeof ad.became_new_date === "string" ? ad.became_new_date : null,
    changed_date: typeof ad.changed_date === "string" ? ad.changed_date : null,
    removed_date:
      typeof ad.removed_date === "string"
        ? ad.removed_date
        : typeof ad.became_removed_date === "string"
          ? ad.became_removed_date
          : null,
    became_removed_date:
      typeof ad.became_removed_date === "string" ? ad.became_removed_date : null,
    last_seen_global:
      typeof ad.last_seen_global === "string" ? ad.last_seen_global : null,
  };
};

const extractTotalCount = (payload: AdsResponse): number | null => {
  const paginationTotal = payload.pagination?.total;
  if (typeof paginationTotal === "number" && Number.isFinite(paginationTotal)) {
    return paginationTotal;
  }
  return null;
};

const extractAdsFromResponse = (payload: AdsResponse): Record<string, unknown>[] => {
  const explicit =
    payload.current_ads ?? payload.active ?? payload.new ?? payload.added ?? payload.removed ?? payload.changed;
  if (Array.isArray(explicit)) {
    return explicit as unknown as Record<string, unknown>[];
  }

  const generic = payload.ads ?? payload.data ?? payload.items ?? payload.results;
  if (Array.isArray(generic)) {
    return generic as Record<string, unknown>[];
  }

  return [];
};

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [selectedCompetitors, setSelectedCompetitors] = useState<(string | number)[]>([]);
  const [selectedDestinations, setSelectedDestinations] = useState<(string | number)[]>([]);
  const [ads, setAds] = useState<CreativeRecord[]>([]);
  const [page, setPage] = useState(1);
  const [, setTotalCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdsSummaryResponse | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const summaryRequestIdRef = useRef(0);
  const lastSummaryFiltersKeyRef = useRef<string | null>(null);

  const baseFilters = useMemo<Omit<AdsFilters, "status" | "page" | "limit">>(
    () => ({
      competitor_id:
        selectedCompetitors.length > 0
          ? selectedCompetitors.map((id) => String(id)).join(",")
          : undefined,
      destination_id:
        selectedDestinations.length > 0
          ? selectedDestinations.map((id) => String(id)).join(",")
          : undefined,
      sort: "created_at",
      order: "desc",
    }),
    [selectedCompetitors, selectedDestinations],
  );

  const statusFilter = activeTab === "all" ? undefined : activeTab;
  const competitorIdForSummary =
    selectedCompetitors.length > 0
      ? selectedCompetitors.map((id) => String(id)).join(",")
      : undefined;
  const destinationIdForSummary =
    selectedDestinations.length > 0
      ? selectedDestinations.map((id) => String(id)).join(",")
      : undefined;

  const competitorsQuery = useQuery({
    queryKey: ["competitors"],
    queryFn: getCompetitors,
  });

  const destinationsQuery = useQuery({
    queryKey: ["destinations"],
    queryFn: getDestinations,
  });

  const fetchSummary = useCallback(
    async (competitorId: string | undefined, destinationId: string | undefined) => {
      const summaryRequestId = ++summaryRequestIdRef.current;
      setSummary(null);
      setSummaryError(null);
      setIsSummaryLoading(true);

      try {
        const summaryResponse = await getAdsSummary({
          competitorId,
          destinationId,
        });

        if (summaryRequestId === summaryRequestIdRef.current) {
          setSummary(summaryResponse);
        }
      } catch (err) {
        if (summaryRequestId === summaryRequestIdRef.current) {
          const message =
            err instanceof Error ? err.message : "Failed to fetch ads summary";
          setSummaryError(message);
        }
      } finally {
        if (summaryRequestId === summaryRequestIdRef.current) {
          setIsSummaryLoading(false);
        }
      }
    },
    [],
  );

  const fetchAdsPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const response = (await getAds({
          ...baseFilters,
          status: statusFilter,
          page: nextPage,
          limit: PAGE_LIMIT,
        })) as AdsResponse;

        if (requestId !== requestIdRef.current) {
          return;
        }

        const nextPageAds = extractAdsFromResponse(response).map(mapRaw);

        setAds((prev) => (replace ? nextPageAds : [...prev, ...nextPageAds]));
        setPage(nextPage);

        const total = extractTotalCount(response);
        if (total !== null) {
          setTotalCount(total);
          setHasNextPage(nextPage * PAGE_LIMIT < total);
        } else {
          const computedTotal = (nextPage - 1) * PAGE_LIMIT + nextPageAds.length;
          setTotalCount(computedTotal);
          setHasNextPage(nextPageAds.length === PAGE_LIMIT);
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to fetch ads";
        setError(message);
        if (replace) {
          setAds([]);
          setPage(1);
          setTotalCount(0);
          setHasNextPage(false);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [baseFilters, statusFilter],
  );

  useEffect(() => {
    const summaryFiltersKey = `${competitorIdForSummary ?? "null"}::${destinationIdForSummary ?? "null"}`;
    const shouldReloadSummary = lastSummaryFiltersKeyRef.current !== summaryFiltersKey;
    lastSummaryFiltersKeyRef.current = summaryFiltersKey;

    const run = async () => {
      if (shouldReloadSummary) {
        await fetchSummary(competitorIdForSummary, destinationIdForSummary);
      }

      setAds([]);
      setPage(1);
      setTotalCount(0);
      setHasNextPage(false);
      await fetchAdsPage(1, true);
    };

    void run();
  }, [fetchAdsPage, fetchSummary, competitorIdForSummary, destinationIdForSummary]);

  const loading = isLoading && ads.length === 0;

  if (loading) {
    return <LoadingSkeleton />;
  }

  if ((competitorsQuery.error || destinationsQuery.error) && ads.length === 0) {
    const firstError = competitorsQuery.error ?? destinationsQuery.error;
    const message = firstError instanceof Error ? firstError.message : "Failed to fetch ads";
    return <ErrorState message={message} />;
  }

  const effectiveSummary: AdsSummaryResponse = {
    totalAds: summary?.totalAds ?? 0,
    newAds: summary?.newAds ?? 0,
    activeAds: summary?.activeAds ?? 0,
    removedAds: summary?.removedAds ?? 0,
    removedAdsLast7Days: summary?.removedAdsLast7Days ?? 0,
    changedAds: summary?.changedAds ?? 0,
  };

  const tabType = activeTab === "new" ? "added" : activeTab === "all" ? "all" : activeTab;
  const competitorAnnotations = Object.fromEntries(
    (competitorsQuery.data ?? [])
      .map((option) => [option.id, getModuleAnnotation(option, "ads")])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-2">
        <SummaryCards summary={effectiveSummary} isLoading={isSummaryLoading} />
        {summaryError ? (
          <p className="text-sm text-muted-foreground">Summary unavailable, showing 0 values.</p>
        ) : null}
      </div>

      <FilterBar
        competitors={competitorsQuery.data ?? []}
        destinations={destinationsQuery.data ?? []}
        selectedCompetitors={selectedCompetitors}
        selectedDestinations={selectedDestinations}
        onCompetitorsChange={setSelectedCompetitors}
        onDestinationsChange={setSelectedDestinations}
        competitorAnnotations={competitorAnnotations}
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as StatusTab)}
        defaultValue="all"
        className="space-y-6"
      >
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="all" className="gap-2">
            All Ads
            <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary">
              {effectiveSummary.totalAds}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="new" className="gap-2">
            New Ads
            <Badge variant="secondary" className="ml-1 bg-success/10 text-success">
              {effectiveSummary.newAds}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-2">
            Active Ads
            <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary">
              {effectiveSummary.activeAds}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="removed" className="gap-2">
            Removed
            <Badge variant="secondary" className="ml-1 bg-destructive/10 text-destructive">
              {effectiveSummary.removedAds}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="changed" className="gap-2">
            Changed
            <Badge variant="secondary" className="ml-1 bg-warning/10 text-warning">
              {effectiveSummary.changedAds}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <AdsList ads={ads} type={tabType} emptyMessage="No ads available" />

          {error && ads.length > 0 ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

          {hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={() => void fetchAdsPage(page + 1, false)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
