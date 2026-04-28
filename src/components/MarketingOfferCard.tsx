import { BadgePercent, CalendarDays, ExternalLink, Link2 } from "lucide-react";

import type { MarketingOfferRecord } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface MarketingOfferCardProps {
  offer: MarketingOfferRecord;
}

const formatDate = (value: string): string => {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

export function MarketingOfferCard({ offer }: MarketingOfferCardProps) {
  const hasLink = Boolean(offer.url);

  return (
    <div className="rounded-lg bg-card p-4 shadow-card transition-all hover:shadow-md animate-fade-in">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BadgePercent className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-lg font-semibold text-card-foreground">
              {offer.title || "Untitled marketing offer"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {offer.competitor_name || "Unknown competitor"}
            </p>
          </div>
        </div>

        {offer.description ? <p className="text-sm text-card-foreground">{offer.description}</p> : null}

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Detected</p>
            <p className="mt-1 flex items-center gap-2 font-medium text-card-foreground">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {formatDate(offer.detected_at)}
            </p>
          </div>

          <div>
            <p className="text-muted-foreground">Validity</p>
            <p className="mt-1 font-medium text-card-foreground">{offer.validity || "—"}</p>
          </div>
        </div>

        {offer.cta_text ? (
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">CTA</p>
            <p className="mt-1 font-medium text-card-foreground">{offer.cta_text}</p>
          </div>
        ) : null}

        {offer.raw_text ? (
          <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            {offer.raw_text}
          </div>
        ) : null}

        {hasLink ? (
          <Button variant="outline" size="sm" className="mt-1 w-full sm:w-fit" asChild>
            <a href={offer.url} target="_blank" rel="noopener noreferrer">
              <Link2 className="mr-2 h-4 w-4" />
              View Promotion
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
