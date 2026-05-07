"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useNotifications } from "./notifications-provider";

const NAV_ITEMS = [
  { href: "/", label: "Ads" },
  { href: "/offers", label: "Live Prices" },
  { href: "/marketing-offers", label: "Marketing Offers" },
  { href: "/notifications", label: "Notifications" },
];

export function MonitorNavigation() {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();

  return (
    <header className="topbar">
      <div className="brand-lockup">
        <span className="brand-mark">OH</span>
        <div>
          <p className="brand-kicker">Olympic Holidays</p>
          <h1>Monitor</h1>
        </div>
      </div>

      <nav className="main-nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;

          return (
            <Link key={item.href} className={`nav-link ${active ? "active" : ""}`} href={item.href}>
              <span>{item.label}</span>
              {item.href === "/notifications" && unreadCount > 0 ? (
                <span className="nav-badge">{unreadCount}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
