import type { CompetitorSlug } from "scraper-engine";

export const ADS_COMPETITOR_TARGETS: Record<CompetitorSlug, string[]> = {
  "jet2-holidays": ["jet2holidays.com"],
  "easyjet-holidays": ["easyjet.com"],
  tui: ["tui.co.uk"],
  sunvil: ["sunvil.co.uk"],
  "ionian-island-holidays": ["ionianislandholidays.com"],
  loveholidays: ["loveholidays.com"],
};

export function getAdsSettings() {
  const depth = Number.parseInt(process.env.DATAFORSEO_ADS_DEPTH ?? "120", 10) || 120;
  const configuredOcrMax = Number.parseInt(process.env.ADS_OCR_MAX_PER_COMPETITOR ?? "", 10);
  const ocrMaxPerCompetitor =
    Number.isFinite(configuredOcrMax) && configuredOcrMax >= 0
      ? configuredOcrMax === 0
        ? 0
        : Math.max(configuredOcrMax, depth)
      : depth;

  return {
    locationName: process.env.DATAFORSEO_GOOGLE_LOCATION_NAME ?? "United Kingdom",
    platform: process.env.DATAFORSEO_GOOGLE_PLATFORM ?? "all",
    depth,
    ocrEnabled: (process.env.ADS_OCR_ENABLED ?? "true") !== "false",
    ocrMaxPerCompetitor,
  };
}
