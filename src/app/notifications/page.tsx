"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { NotificationCard } from "@/components/NotificationCard";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { DashboardSkeleton as LoadingSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { Header } from "@/components/layout/Header";
import { useNotifications } from "@/components/monitor/notifications-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCompetitors, getDestinations } from "@/lib/api";
import {
  fetchNotifications,
  type NotificationItem,
  type NotificationSourceFilter,
} from "@/lib/notifications";

const PAGE_LIMIT = 20;
const ALL_SOURCES_VALUE = "__all_sources__";

export default function NotificationsPage() {
  const [selectedCompetitors, setSelectedCompetitors] = useState<(string | number)[]>([]);
  const [selectedDestinations, setSelectedDestinations] = useState<(string | number)[]>([]);
  const [source, setSource] = useState<string>(ALL_SOURCES_VALUE);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { markAllRead } = useNotifications();

  const requestIdRef = useRef(0);

  const competitorsQuery = useQuery({
    queryKey: ["competitors"],
    queryFn: getCompetitors,
  });

  const destinationsQuery = useQuery({
    queryKey: ["destinations"],
    queryFn: getDestinations,
  });

  const baseFilters = useMemo(
    () => ({
      competitor_id:
        selectedCompetitors.length > 0
          ? selectedCompetitors.map((id) => String(id)).join(",")
          : undefined,
      destination_id:
        selectedDestinations.length > 0
          ? selectedDestinations.map((id) => String(id)).join(",")
          : undefined,
      source:
        source !== ALL_SOURCES_VALUE ? (source as NotificationSourceFilter) : undefined,
      search: search || undefined,
      sort: "created_at" as const,
      order: "desc" as const,
    }),
    [search, selectedCompetitors, selectedDestinations, source],
  );

  const fetchPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetchNotifications({
          ...baseFilters,
          page: nextPage,
          limit: PAGE_LIMIT,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        setNotifications((prev) =>
          replace ? response.alerts : [...prev, ...response.alerts],
        );
        setPage(nextPage);
        setHasNextPage(response.has_next_page);

        if (replace) {
          markAllRead(response.alerts[0]?.created_at ?? null);
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        const message =
          err instanceof Error ? err.message : "Failed to fetch notifications";
        setError(message);
        if (replace) {
          setNotifications([]);
          setPage(1);
          setHasNextPage(false);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [baseFilters, markAllRead],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const run = async () => {
      setNotifications([]);
      setPage(1);
      setHasNextPage(false);
      await fetchPage(1, true);
    };

    void run();
  }, [fetchPage]);

  const loading = isLoading && notifications.length === 0;

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

  if ((competitorsQuery.error || destinationsQuery.error) && notifications.length === 0) {
    const firstError = competitorsQuery.error ?? destinationsQuery.error;
    const message =
      firstError instanceof Error ? firstError.message : "Failed to fetch notifications";
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <ErrorState message={message} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container space-y-6 py-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-foreground">Notifications</h2>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex flex-col gap-4">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search notifications"
              className="max-w-md"
            />

            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SOURCES_VALUE}>All sources</SelectItem>
                <SelectItem value="offers">Live Prices</SelectItem>
                <SelectItem value="marketing">Marketing Offers</SelectItem>
              </SelectContent>
            </Select>

            <FilterBar
              competitors={competitorsQuery.data ?? []}
              destinations={destinationsQuery.data ?? []}
              selectedCompetitors={selectedCompetitors}
              selectedDestinations={selectedDestinations}
              onCompetitorsChange={setSelectedCompetitors}
              onDestinationsChange={setSelectedDestinations}
            />
          </div>
        </div>

        <div className="space-y-4">
          {notifications.map((notification) => (
            <NotificationCard key={notification.id} notification={notification} />
          ))}

          {notifications.length === 0 ? (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              No notifications available.
            </div>
          ) : null}
        </div>

        {error && notifications.length > 0 ? (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        ) : null}

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
