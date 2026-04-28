import type { CapabilityState, CompetitorModule } from "@olympic/contracts";

import { loadDestinationSeed, loadKeywordSeed } from "./taxonomy";

export const competitorSeed = [
  {
    id: 1,
    slug: "jet2-holidays",
    name: "Jet2 Holidays",
    websiteUrl: "https://www.jet2holidays.com/",
  },
  {
    id: 2,
    slug: "easyjet-holidays",
    name: "easyJet Holidays",
    websiteUrl: "https://www.easyjet.com/en/holidays",
  },
  {
    id: 3,
    slug: "tui",
    name: "TUI",
    websiteUrl: "https://www.tui.co.uk/",
  },
  {
    id: 4,
    slug: "sunvil",
    name: "Sunvil",
    websiteUrl: "https://www.sunvil.co.uk/",
  },
  {
    id: 5,
    slug: "ionian-island-holidays",
    name: "Ionian Island Holidays",
    websiteUrl: "https://www.ionianislandholidays.com/",
  },
  {
    id: 6,
    slug: "loveholidays",
    name: "loveholidays",
    websiteUrl: "https://www.loveholidays.com/",
  },
] as const;

export const destinationSeed = loadDestinationSeed();

export const keywordSeed = loadKeywordSeed();

export const capabilitySeed: Array<{
  competitorId: number;
  module: CompetitorModule;
  state: CapabilityState;
  note: string | null;
}> = [
  { competitorId: 1, module: "offers", state: "in_progress", note: "Promotions working, live prices not stable yet." },
  { competitorId: 1, module: "marketing", state: "enabled", note: "Promotions extraction is working." },
  { competitorId: 1, module: "ads", state: "enabled", note: "Google Ads Transparency ingestion enabled via DataForSEO." },
  { competitorId: 2, module: "offers", state: "enabled", note: "Promotions and live prices working." },
  { competitorId: 2, module: "marketing", state: "enabled", note: "Promotions extraction is working." },
  { competitorId: 2, module: "ads", state: "enabled", note: "Google Ads Transparency ingestion enabled via DataForSEO." },
  { competitorId: 3, module: "offers", state: "in_progress", note: "Promotions working, live prices not stable yet." },
  { competitorId: 3, module: "marketing", state: "enabled", note: "Promotions extraction is working." },
  { competitorId: 3, module: "ads", state: "enabled", note: "Google Ads Transparency ingestion enabled via DataForSEO." },
  { competitorId: 4, module: "offers", state: "enabled", note: "Live prices working; promotions currently blocked." },
  { competitorId: 4, module: "marketing", state: "blocked", note: "Promotions currently blocked by challenge or selector gaps." },
  { competitorId: 4, module: "ads", state: "enabled", note: "Ads provider is live; Sunvil may simply have no current UK Google ads." },
  { competitorId: 5, module: "offers", state: "enabled", note: "Promotions and live prices working." },
  { competitorId: 5, module: "marketing", state: "enabled", note: "Promotions extraction is working." },
  { competitorId: 5, module: "ads", state: "enabled", note: "Google Ads Transparency ingestion enabled via DataForSEO." },
  { competitorId: 6, module: "offers", state: "blocked", note: "Blocked by captcha or anti-bot protection." },
  { competitorId: 6, module: "marketing", state: "blocked", note: "Blocked by captcha or anti-bot protection." },
  { competitorId: 6, module: "ads", state: "enabled", note: "Google Ads Transparency ingestion enabled via DataForSEO." },
];
