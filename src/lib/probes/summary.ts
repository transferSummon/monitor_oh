import { COMPETITORS, type CompetitorRollup, type ProbeRunArtifact } from "@/lib/probes/types";
import { summarizeMethods } from "@/lib/probes/utils";

export function createRollups(artifact: ProbeRunArtifact | null): CompetitorRollup[] {
  return COMPETITORS.map((competitor) => {
    const competitorResults =
      artifact?.results.filter((result) => result.competitor === competitor.slug) ?? [];

    const promotions =
      competitorResults.find((result) => result.probeType === "promotions") ?? null;
    const livePrices =
      competitorResults.find((result) => result.probeType === "live_prices") ?? null;

    const statuses = competitorResults.map((result) => result.status);
    const hasBrowser = competitorResults.some((result) => result.method.startsWith("browser"));
    const hasSuccess = statuses.includes("success");
    const hasPartial = statuses.includes("partial");
    const allBlocked =
      competitorResults.length > 0 &&
      competitorResults.every((result) => result.status === "blocked" || result.status === "failed");

    let viability: CompetitorRollup["viability"] = "Not run yet";

    if (competitorResults.length === 0) viability = "Not run yet";
    else if (hasSuccess && !hasBrowser) viability = "Viable";
    else if (hasSuccess && hasBrowser) viability = "Viable with browser";
    else if (hasPartial || competitorResults.length > 0) viability = "High risk";
    else if (allBlocked) viability = "Blocked";

    return {
      competitor,
      promotions,
      livePrices,
      methodSummary:
        competitorResults.length > 0 ? summarizeMethods(competitorResults) : "Mixed",
      viability,
      lastObservedAt:
        competitorResults
          .map((result) => result.observedAt)
          .sort()
          .at(-1) ?? null,
    };
  });
}
