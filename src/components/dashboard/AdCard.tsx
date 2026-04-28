import { ExternalLink, Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CreativeRecord } from "@/types/snapshot";

import { formatDestination, formatRegions, getImageFromAd, getVideoUrlsFromAd } from "./adUtils";

const fmt = (d?: string | null) => (d ? d.split("T")[0] : "");

interface AdCardProps {
  ad: CreativeRecord;
  type: "all" | "active" | "added" | "removed" | "changed";
}

function getTransparencyUrl(advertiserId?: string | null, creativeId?: string): string | null {
  if (!advertiserId || !creativeId) return null;
  return `https://adstransparency.google.com/advertiser/${advertiserId}/creative/${creativeId}`;
}

function isYouTube(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const queryId = parsed.searchParams.get("v");
      if (queryId) return queryId;
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      const embedIndex = pathParts.findIndex((part) => part === "embed" || part === "shorts");
      if (embedIndex >= 0 && pathParts[embedIndex + 1]) {
        return pathParts[embedIndex + 1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

function isMp4(url: string): boolean {
  return /\.mp4(?:$|[?#])/i.test(url);
}

function isVideoCdn(url: string): boolean {
  return /(googlevideo|gvt1|doubleclick|googlesyndication|googleusercontent)/i.test(url);
}

export function AdCard({ ad, type }: AdCardProps) {
  const transparencyUrl = ad.url || getTransparencyUrl(ad.advertiser_id, ad.creative_id);
  const imageUrl = getImageFromAd(ad);
  const videoUrls = getVideoUrlsFromAd(ad);
  const destination = formatDestination(ad);
  const youtubeVideo = videoUrls.find((url) => isYouTube(url));
  const youtubeId = youtubeVideo ? extractYouTubeId(youtubeVideo) : null;
  const mp4Video = videoUrls.find((url) => isMp4(url) || isVideoCdn(url));

  const typeStyles = {
    all: "border-l-4 border-l-primary",
    active: "border-l-4 border-l-primary",
    added: "border-l-4 border-l-success",
    removed: "border-l-4 border-l-destructive",
    changed: "border-l-4 border-l-warning",
  };

  return (
    <div
      className={`rounded-lg bg-card p-4 shadow-card transition-all hover:shadow-md animate-fade-in ${typeStyles[type]}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="mt-0.5 text-xs text-muted-foreground">ID: {ad.creative_id || "Unknown"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Badge variant="secondary" className="text-xs">
            {formatRegions(ad)}
          </Badge>
        </div>

        <div className="text-sm text-muted-foreground">
          Destination: <span className="text-card-foreground">{destination}</span>
        </div>

        <div className="text-sm text-muted-foreground">
          Format: <span className="text-card-foreground">{ad.format}</span>
        </div>

        {ad.became_new_date ? (
          <div className="text-sm text-muted-foreground">
            New since: <span className="text-card-foreground">{fmt(ad.became_new_date)}</span>
          </div>
        ) : null}

        {ad.changed_date ? (
          <div className="text-sm text-muted-foreground">
            Last modified: <span className="text-card-foreground">{fmt(ad.changed_date)}</span>
          </div>
        ) : null}

        {ad.became_removed_date ? (
          <div className="text-sm text-muted-foreground">
            Removed on: <span className="text-card-foreground">{fmt(ad.became_removed_date)}</span>
          </div>
        ) : null}

        {ad.last_seen_global ? (
          <div className="text-sm text-muted-foreground">
            Last seen: <span className="text-card-foreground">{fmt(ad.last_seen_global)}</span>
          </div>
        ) : null}

        <div className="mt-2 max-h-[250px] w-full overflow-y-auto overflow-x-hidden rounded-md border border-border/70 bg-muted/20 shadow-sm">
          {youtubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title={`YouTube preview ${ad.creative_id}`}
              className="block min-h-[220px] w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : mp4Video ? (
            <video controls className="block h-auto w-full">
              <source src={mp4Video} type="video/mp4" />
            </video>
          ) : imageUrl ? (
            <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block w-full">
              <img
                src={imageUrl}
                alt={ad.creative_id}
                className="block h-auto w-full object-contain"
                loading="lazy"
              />
            </a>
          ) : (
            <p className="p-3 text-sm text-muted-foreground">No video preview available</p>
          )}
        </div>

        <details className="rounded-md border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">Raw Data</summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-background p-3 text-xs">
            {JSON.stringify(ad.metadata ?? {}, null, 2)}
          </pre>
        </details>

        {transparencyUrl ? (
          <Button variant="outline" size="sm" className="mt-1 w-full" asChild>
            <a href={transparencyUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              View on Google Ads Transparency
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
