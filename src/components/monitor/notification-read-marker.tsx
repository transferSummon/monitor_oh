"use client";

import { useEffect } from "react";

import { useNotifications } from "./notifications-provider";

export function NotificationReadMarker({ latestAlertTimestamp }: { latestAlertTimestamp: string | null }) {
  const { markAllRead } = useNotifications();

  useEffect(() => {
    markAllRead(latestAlertTimestamp);
  }, [latestAlertTimestamp, markAllRead]);

  return null;
}
