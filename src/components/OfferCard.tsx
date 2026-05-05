import { ExternalLink, MapPin, Plane, Tag } from "lucide-react";

import type { OfferRecord, OfferStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OfferCardProps {
  offer: OfferRecord;
}

interface OfferDescriptionMeta {
  destinations?: unknown;
  product_types?: unknown;
}

const statusStyles: Record<OfferStatus, string> = {
  new: "bg-success/10 text-success border-success/20",
  active: "bg-primary/10 text-primary border-primary/20",
  removed: "bg-destructive/10 text-destructive border-destructive/20",
  changed: "bg-warning/10 text-warning border-warning/20",
};

const tagLabel = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidate = obj.name ?? obj.label ?? obj.value ?? obj.title;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
};

const getTags = (value: unknown, maxItems = 3): string[] => {
  if (!Array.isArray(value)) return [];

  const tags: string[] = [];
  for (const item of value) {
    const label = tagLabel(item);
    if (label && !tags.includes(label)) {
      tags.push(label);
    }
    if (tags.length === maxItems) {
      break;
    }
  }

  return tags;
};

const parseDescription = (description: string): OfferDescriptionMeta | null => {
  if (!description) return null;

  try {
    const parsed = JSON.parse(description) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as OfferDescriptionMeta) : null;
  } catch {
    return null;
  }
};

const formatPrice = (priceNumeric: string | null, currency: string): string => {
  if (!priceNumeric) return "—";

  const amount = Number(priceNumeric);
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
};

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
  }).format(parsed);
};

const statusLabel = (status: OfferStatus): string =>
  status.charAt(0).toUpperCase() + status.slice(1);

export function OfferCard({ offer }: OfferCardProps) {
  const parsedDescription = parseDescription(offer.description);
  const destinationTags = getTags(parsedDescription?.destinations, 3);
  const productTypeTags = getTags(parsedDescription?.product_types, 2);
  const imageSrc = offer.image_url || "/placeholder.svg";
  const classifiedDestinations =
    offer.destinations.length > 0
      ? offer.destinations.map((destination) => destination.name)
      : offer.destination_name
        ? [offer.destination_name]
        : [];

  return (
    <div className="rounded-lg bg-card p-4 shadow-card transition-all hover:shadow-md animate-fade-in">
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-md bg-muted">
          <img
            src={imageSrc}
            alt={offer.offer_title || "Offer image"}
            className="h-48 w-full object-cover"
            loading="lazy"
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="line-clamp-2 text-lg font-semibold text-card-foreground">
              {offer.offer_title || "Untitled offer"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {offer.competitor_name || "Unknown competitor"}
            </p>
          </div>
          <Badge variant="outline" className={statusStyles[offer.status]}>
            {statusLabel(offer.status)}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Price</p>
            <p className="font-medium text-card-foreground">
              {formatPrice(offer.price_numeric, offer.currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium text-card-foreground">{offer.duration_days} days</p>
          </div>
          <div>
            <p className="text-muted-foreground">Departure</p>
            <p className="font-medium text-card-foreground">{formatDate(offer.departure_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Destination</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {classifiedDestinations.length > 0 ? (
                classifiedDestinations.map((destination) => (
                  <Badge key={destination} variant="secondary" className="text-xs">
                    {destination}
                  </Badge>
                ))
              ) : (
                <span className="font-medium text-card-foreground">—</span>
              )}
            </div>
          </div>
        </div>

        {destinationTags.length > 0 || productTypeTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {destinationTags.map((tag) => (
              <Badge key={`destination-${tag}`} variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" />
                {tag}
              </Badge>
            ))}
            {productTypeTags.map((tag) => (
              <Badge key={`product-${tag}`} variant="secondary" className="gap-1">
                <Tag className="h-3 w-3" />
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        <Button variant="outline" size="sm" className="mt-1 w-full" asChild>
          <a href={offer.offer_url} target="_blank" rel="noopener noreferrer">
            <Plane className="mr-2 h-4 w-4" />
            View Offer
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
