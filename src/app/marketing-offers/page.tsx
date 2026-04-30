"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileX2, Loader2 } from "lucide-react";

import { MarketingOfferCard } from "@/components/MarketingOfferCard";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { DashboardSkeleton as LoadingSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCompetitors,
  getMarketingOffers,
  getModuleAnnotation,
  type CompetitorFilterOption,
  type MarketingOfferRecord,
} from "@/lib/api";

const PAGE_LIMIT = 50;
const ALL_COMPETITORS_VALUE = "__all_competitors__";
const MARKETING_COMPETITOR_ANNOTATIONS: Partial<Record<string, string>> = {
  "1": "Currently not available",
  "3": "Blocked by anti-bot protection",
  "4": "Blocked by site challenge; marketing offers unavailable.",
  "6": "Blocked by anti-bot protection; marketing offers unavailable.",
};

export default function MarketingOffersPage() {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string>(ALL_COMPETITORS_VALUE);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offers, setOffers] = useState<MarketingOfferRecord[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const competitorsQuery = useQuery({
    queryKey: ["competitors"],
    queryFn: getCompetitors,
  });

  const baseFilters = useMemo(
    () => ({
      competitor_id:
        selectedCompetitor !== ALL_COMPETITORS_VALUE ? selectedCompetitor : undefined,
      search: search || undefined,
      sort: "detected_at",
      order: "desc" as const,
    }),
    [search, selectedCompetitor],
  );

  const fetchPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const response = await getMarketingOffers({
          ...baseFilters,
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

        const message =
          err instanceof Error ? err.message : "Failed to fetch marketing offers";
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
    [baseFilters],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const run = async () => {
      setOffers([]);
      setPage(1);
      setHasNextPage(false);
      await fetchPage(1, true);
    };

    void run();
  }, [fetchPage]);

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

  if (competitorsQuery.error && offers.length === 0) {
    const message =
      competitorsQuery.error instanceof Error
        ? competitorsQuery.error.message
        : "Failed to fetch marketing offers";
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <ErrorState message={message} />
        </main>
      </div>
    );
  }

  const competitorOptions: CompetitorFilterOption[] = competitorsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container space-y-6 py-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-foreground">Marketing Offers</h2>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search marketing offers"
              className="max-w-md"
            />

            <Select value={selectedCompetitor} onValueChange={setSelectedCompetitor}>
              <SelectTrigger className="w-full md:w-[240px]">
                <SelectValue placeholder="Competitor" />
              </SelectTrigger>
              <SelectContent className="w-[min(28rem,calc(100vw-2rem))]">
                <SelectItem value={ALL_COMPETITORS_VALUE}>All competitors</SelectItem>
                {competitorOptions.map((option) => {
                  const annotation =
                    MARKETING_COMPETITOR_ANNOTATIONS[option.id] ?? getModuleAnnotation(option, "marketing");

                  return (
                    <SelectItem key={option.id} value={option.id} className="items-start">
                      <div className="flex max-w-full flex-col">
                        <span>{option.label}</span>
                        {annotation ? (
                          <span className="whitespace-normal text-xs leading-snug text-muted-foreground">
                            {annotation}
                          </span>
                        ) : null}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {offers.map((offer) => (
            <MarketingOfferCard key={offer.id} offer={offer} />
          ))}
        </div>

        {offers.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <FileX2 className="h-10 w-10 text-muted-foreground/40" />
              <p>No marketing offers available.</p>
            </div>
          </div>
        ) : null}

        {error && offers.length > 0 ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        {hasNextPage ? (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={() => void fetchPage(page + 1, false)}
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
      </main>
    </div>
  );
}
