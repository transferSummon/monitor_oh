import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import { NotificationsProvider } from "@/components/monitor/notifications-provider";
import { listAlerts } from "@/lib/server/repository";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Wendy Wu Tours UK",
  description: "Wendy Wu Tours UK ad monitor dashboard.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const notificationSnapshot = await listAlerts(new URLSearchParams([["limit", "1"]]));
  const latestAlertTimestamp = notificationSnapshot.alerts[0]?.createdAt ?? null;

  return (
    <html lang="en">
      <body>
        <NotificationsProvider
          initialUnreadCount={notificationSnapshot.totalCount}
          latestAlertTimestamp={latestAlertTimestamp}
        >
          <Providers>{children}</Providers>
        </NotificationsProvider>
      </body>
    </html>
  );
}
