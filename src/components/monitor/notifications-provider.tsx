"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface NotificationsContextValue {
  unreadCount: number;
  latestAlertTimestamp: string | null;
  setUnreadCount: (count: number) => void;
  refreshUnreadCount: () => Promise<void>;
  markAllRead: (timestamp?: string | null) => void;
}

const STORAGE_KEY = "olympic-monitor:last-read-alert";

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function hasSeenLatest(seenAt: string | null, latestAlertTimestamp: string | null) {
  if (!latestAlertTimestamp) return true;
  if (!seenAt) return false;
  return new Date(seenAt).getTime() >= new Date(latestAlertTimestamp).getTime();
}

export function NotificationsProvider({
  children,
  initialUnreadCount,
  latestAlertTimestamp,
}: {
  children: React.ReactNode;
  initialUnreadCount: number;
  latestAlertTimestamp: string | null;
}) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  const refreshUnreadCount = async () => {
    const response = await fetch("/api/alerts?limit=1", { cache: "no-store" });
    if (!response.ok) return;

    const payload = (await response.json()) as {
      totalCount?: number;
      alerts?: Array<{ createdAt?: string | null }>;
    };
    const seenAt = window.localStorage.getItem(STORAGE_KEY);
    const latestFromApi = payload.alerts?.[0]?.createdAt ?? latestAlertTimestamp;

    if (hasSeenLatest(seenAt, latestFromApi ?? null)) {
      setUnreadCount(0);
      return;
    }

    setUnreadCount(typeof payload.totalCount === "number" ? payload.totalCount : initialUnreadCount);
  };

  useEffect(() => {
    const seenAt = window.localStorage.getItem(STORAGE_KEY);
    if (hasSeenLatest(seenAt, latestAlertTimestamp)) {
      setUnreadCount(0);
      return;
    }

    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount, latestAlertTimestamp]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      unreadCount,
      latestAlertTimestamp,
      setUnreadCount,
      refreshUnreadCount,
      markAllRead: (timestamp) => {
        const valueToStore = timestamp ?? latestAlertTimestamp ?? new Date().toISOString();
        window.localStorage.setItem(STORAGE_KEY, valueToStore);
        setUnreadCount(0);
      },
    }),
    [latestAlertTimestamp, unreadCount],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error("useNotifications must be used inside NotificationsProvider.");
  }

  return context;
}
