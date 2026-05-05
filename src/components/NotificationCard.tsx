import { ExternalLink } from "lucide-react";

import type { NotificationItem } from "@/lib/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const typeLabel: Record<NotificationItem["type"], string> = {
  new_offer: "New",
  updated_offer: "Updated",
  removed_offer: "Removed",
};

const typeStyles: Record<NotificationItem["type"], string> = {
  new_offer: "bg-primary/10 text-primary border-primary/20",
  updated_offer: "bg-warning/10 text-warning border-warning/20",
  removed_offer: "bg-destructive/10 text-destructive border-destructive/20",
};

const currentStatusLabel: Record<NonNullable<NotificationItem["current_status"]>, string> = {
  new: "Current: New",
  active: "Current: Active",
  changed: "Current: Changed",
  removed: "Current: Removed",
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export function NotificationCard({ notification }: { notification: NotificationItem }) {
  const imageSrc = notification.preview_image || "/placeholder.svg";
  const sourceLabel =
    notification.source === "marketing" ? "Marketing Offers" : "Live Prices";
  const ctaLabel = notification.source === "marketing" ? "View Promotion" : "View Offer";
  const destinations =
    notification.destinations.length > 0
      ? notification.destinations.map((destination) => destination.name)
      : notification.destination_name
        ? [notification.destination_name]
        : ["Unknown"];

  return (
    <div className="rounded-lg bg-card p-4 shadow-card transition-all hover:shadow-md animate-fade-in">
      <div className="grid gap-4 md:grid-cols-[220px,1fr]">
        <div className="overflow-hidden rounded-md bg-muted">
          <img
            src={imageSrc}
            alt={notification.message}
            className="h-[180px] w-full object-cover"
            loading="lazy"
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{formatDate(notification.created_at)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={typeStyles[notification.type]}>
                {typeLabel[notification.type]}
              </Badge>
              <Badge variant="secondary">{sourceLabel}</Badge>
              {notification.source === "offers" && notification.current_status ? (
                <Badge variant="outline">{currentStatusLabel[notification.current_status]}</Badge>
              ) : null}
              <span className="text-sm text-muted-foreground">{notification.competitor_name}</span>
              <span className="text-muted-foreground">•</span>
              {destinations.map((destination) => (
                <Badge key={destination} variant="secondary">
                  {destination}
                </Badge>
              ))}
            </div>
          </div>

          <p className="text-sm text-foreground">{notification.message}</p>

          {notification.price_text ? (
            <p className="text-sm font-medium text-card-foreground">{notification.price_text}</p>
          ) : null}

          {notification.deep_link_url ? (
            <Button variant="outline" size="sm" className="mt-1 w-full md:w-fit" asChild>
              <a href={notification.deep_link_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                {ctaLabel}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
