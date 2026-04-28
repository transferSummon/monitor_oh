import { FileX2 } from "lucide-react";

import type { CreativeRecord } from "@/types/snapshot";

import { AdCard } from "./AdCard";

interface AdsListProps {
  ads: CreativeRecord[];
  type: "all" | "active" | "added" | "removed" | "changed";
  emptyMessage: string;
}

export function AdsList({ ads, type, emptyMessage }: AdsListProps) {
  if (ads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileX2 className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ads.map((ad, index) => (
        <AdCard key={ad.creative_id || index} ad={ad} type={type} />
      ))}
    </div>
  );
}
