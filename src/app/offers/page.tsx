"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileX2, Loader2 } from "lucide-react";

import { OfferCard } from "@/components/OfferCard";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { DashboardSkeleton as LoadingSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getCompetitors,
  getDestinations,
  getLivePriceCompetitorLabel,
  getModuleAnnotation,
  getOffers,
  getOffersSummary,
  type AdsFilters,
  type AdsSummaryResponse,
  type OfferRecord,
} from "@/lib/api";

const PAGE_LIMIT = 200;

type StatusTab = "all" | "new" | "active" | "removed" | "changed";

const fallbackSummary: AdsSummaryResponse = {
  totalAds: 0,
  newAds: 0,
  activeAds: 0,
  removedAds: 0,
  removedAdsLast7Days: 0,
  changedAds: 0,
};
const LIVE_PRICE_PLAIN_LABEL_COMPETITORS = new Set(["Jet2 Holidays", "TUI"]);

function shouldUsePlainLivePriceLabel(option: { label: string }) {
  return LIVE_PRICE_PLAIN_LABEL_COMPETITORS.has(option.label);
}

export default function OffersPage() {
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [selectedCompetitors, setSelectedCompetitors] = useState<(string | number)[]>([]);
  const [selectedDestinations, setSelectedDestinations] = useState<(string | number)[]>([]);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdsSummaryResponse | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const summaryRequestIdRef = useRef(0);
  const lastSummaryFiltersKeyRef = useRef<string | null>(null);

  const competitorsQuery = useQuery({
    queryKey: ["competitors"],
    queryFn: getCompetitors,
  });

  const destinationsQuery = useQuery({
    queryKey: ["destinations"],
    queryFn: getDestinations,
  });

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

  const fetchSummary = useCallback(async () => {
    const summaryRequestId = ++summaryRequestIdRef.current;
    setSummary(null);
    setSummaryError(null);
    setIsSummaryLoading(true);

    try {
      const response = await getOffersSummary(baseFilters);
      if (summaryRequestId === summaryRequestIdRef.current) {
        setSummary(response);
      }
    } catch (err) {
      if (summaryRequestId === summaryRequestIdRef.current) {
        const message = err instanceof Error ? err.message : "Failed to fetch offers summary";
        setSummaryError(message);
      }
    } finally {
      if (summaryRequestId === summaryRequestIdRef.current) {
        setIsSummaryLoading(false);
      }
    }
  }, [baseFilters]);

  const fetchOffersPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const response = await getOffers({
          ...baseFilters,
          status: statusFilter,
          page: nextPage,
          limit: PAGE_LIMIT,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        setOffers((prev) => (replace ? response.offers : [...prev, ...response.offers]));
        setPage(nextPage);

        const total = response.pagination?.total;
        if (typeof total === "number") {
          setHasNextPage(nextPage * PAGE_LIMIT < total);
        } else {
          setHasNextPage(response.offers.length === PAGE_LIMIT);
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        const message = err instanceof Error ? err.message : "Failed to fetch offers";
        setError(message);
        if (replace) {
          setOffers([]);
          setPage(1);
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
    const summaryFiltersKey = JSON.stringify(baseFilters);
    const shouldReloadSummary = lastSummaryFiltersKeyRef.current !== summaryFiltersKey;
    lastSummaryFiltersKeyRef.current = summaryFiltersKey;

    const run = async () => {
      if (shouldReloadSummary) {
        await fetchSummary();
      }

      setOffers([]);
      setPage(1);
      setHasNextPage(false);
      await fetchOffersPage(1, true);
    };

    void run();
  }, [baseFilters, fetchOffersPage, fetchSummary]);

  const loading = isLoading && offers.length === 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <LoadingSkeleton />
        </main>
      </div>
    );
  }

  if ((competitorsQuery.error || destinationsQuery.error) && offers.length === 0) {
    const firstError = competitorsQuery.error ?? destinationsQuery.error;
    const message = firstError instanceof Error ? firstError.message : "Failed to fetch offers";
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <ErrorState message={message} />
        </main>
      </div>
    );
  }

  const effectiveSummary = { ...fallbackSummary, ...(summary ?? {}) };
  const competitorAnnotations = Object.fromEntries(
    (competitorsQuery.data ?? [])
      .filter((option) => !shouldUsePlainLivePriceLabel(option))
      .map((option) => [option.id, getModuleAnnotation(option, "offers")])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const livePriceCompetitors = (competitorsQuery.data ?? []).map((option) => ({
    ...option,
    label: shouldUsePlainLivePriceLabel(option) ? option.label : getLivePriceCompetitorLabel(option),
  }));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container space-y-8 py-8">
        <div className="space-y-2">
          <SummaryCards summary={effectiveSummary} isLoading={isSummaryLoading} itemLabel="Live Prices" />
          {summaryError ? (
            <p className="text-sm text-muted-foreground">Summary unavailable, showing 0 values.</p>
          ) : null}
        </div>

        <FilterBar
          competitors={livePriceCompetitors}
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
              All Live Prices
              <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary">
                {effectiveSummary.totalAds}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-2">
              New
              <Badge variant="secondary" className="ml-1 bg-success/10 text-success">
                {effectiveSummary.newAds}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-2">
              Active
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
            {offers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileX2 className="mb-4 h-12 w-12 text-muted-foreground/40" />
                <p className="text-muted-foreground">No live prices available</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {offers.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} />
                ))}
              </div>
            )}

            {error && offers.length > 0 ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

            {hasNextPage ? (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => void fetchOffersPage(page + 1, false)}
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
      </main>
    </div>
  );
}
