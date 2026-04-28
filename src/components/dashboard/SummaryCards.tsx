import { BarChart3, Layers, Minus, Plus, RefreshCw } from "lucide-react";

import type { AdsSummaryResponse } from "@/lib/api";

import { SummaryCard } from "./SummaryCard";

interface SummaryCardsProps {
  summary: AdsSummaryResponse;
  isLoading?: boolean;
  itemLabel?: string;
}

export function SummaryCards({
  summary,
  isLoading = false,
  itemLabel = "Ads",
}: SummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <SummaryCard
        title={`Total ${itemLabel}`}
        value={summary.totalAds ?? 0}
        icon={BarChart3}
        variant="default"
        isLoading={isLoading}
      />
      <SummaryCard
        title={`Active ${itemLabel}`}
        value={summary.activeAds ?? 0}
        icon={Layers}
        variant="default"
        subtitle="Currently active"
        isLoading={isLoading}
      />
      <SummaryCard
        title={`New ${itemLabel}`}
        value={summary.newAds ?? 0}
        icon={Plus}
        variant="success"
        subtitle="Added in last 7 days"
        isLoading={isLoading}
      />
      <SummaryCard
        title="Removed"
        value={summary.removedAds ?? 0}
        icon={Minus}
        variant="danger"
        subtitle="Removed in last 7 days"
        isLoading={isLoading}
      />
      <SummaryCard
        title="Changed"
        value={summary.changedAds ?? 0}
        icon={RefreshCw}
        variant="warning"
        subtitle="Modified in last 7 days"
        isLoading={isLoading}
      />
    </div>
  );
}
