"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useNotifications } from "@/components/monitor/notifications-provider";

export function Header() {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const notificationsLabel =
    unreadCount > 0 ? `Notifications (${unreadCount})` : "Notifications";

  const navClassName = (href: string, end = false) => {
    const isActive = end ? pathname === href : pathname === href;
    return `rounded-full px-3 py-1.5 transition-colors ${
      isActive
        ? "bg-muted text-foreground"
        : "text-muted-foreground hover:text-foreground"
    }`;
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-sm">
      <div className="container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center">
          <img
            src="/logo.png"
            alt="Olympic Holiday Logo"
            className="mr-3 h-8 w-auto"
          />
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold text-foreground">Olympic Holiday</h1>
            <span className="leading-none text-xs text-muted-foreground">Ad Monitor</span>
          </div>
        </div>
        <nav className="flex items-center gap-2 text-sm font-medium">
          <Link href="/" className={navClassName("/", true)}>
            Ads
          </Link>
          <Link href="/offers" className={navClassName("/offers")}>
            Live Prices
          </Link>
          <Link href="/marketing-offers" className={navClassName("/marketing-offers")}>
            Marketing Offers
          </Link>
          <Link href="/notifications" className={navClassName("/notifications")}>
            {notificationsLabel}
          </Link>
        </nav>
      </div>
    </header>
  );
}
