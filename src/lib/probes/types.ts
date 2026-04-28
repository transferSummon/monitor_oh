export const COMPETITORS = [
  {
    slug: "jet2-holidays",
    name: "Jet2 Holidays",
    siteUrl: "https://www.jet2holidays.com/",
  },
  {
    slug: "easyjet-holidays",
    name: "easyJet Holidays",
    siteUrl: "https://www.easyjet.com/en/holidays",
  },
  {
    slug: "tui",
    name: "TUI",
    siteUrl: "https://www.tui.co.uk/",
  },
  {
    slug: "sunvil",
    name: "Sunvil",
    siteUrl: "https://www.sunvil.co.uk/",
  },
  {
    slug: "ionian-island-holidays",
    name: "Ionian Island Holidays",
    siteUrl: "https://www.ionianislandholidays.com/",
  },
  {
    slug: "loveholidays",
    name: "loveholidays",
    siteUrl: "https://www.loveholidays.com/",
  },
] as const;

export type CompetitorConfig = (typeof COMPETITORS)[number];
export type CompetitorSlug = CompetitorConfig["slug"];
export type ProbeType = "promotions" | "live_prices";
export type ProbeStatus = "success" | "partial" | "blocked" | "failed";
export type ProbeMethod = "http_html" | "http_form" | "browser_html" | "browser_form";

export interface PromotionSample {
  title: string;
  subtitle: string | null;
  priceText: string | null;
  discountText: string | null;
  destinationText: string | null;
  linkUrl: string | null;
}

export interface LivePriceSample {
  propertyName: string;
  destination: string | null;
  travelDate: string | null;
  nights: string | null;
  boardBasis: string | null;
  priceText: string | null;
  currency: string | null;
  linkUrl: string | null;
}

export interface ProbeResultBase {
  competitor: CompetitorSlug;
  probeType: ProbeType;
  status: ProbeStatus;
  method: ProbeMethod;
  sourceUrl: string;
  observedAt: string;
  sampleCount: number;
  notes: string[];
  blockers: string[];
  screenshotPath: string | null;
  htmlSnippet: string | null;
}

export interface PromotionProbeResult extends ProbeResultBase {
  probeType: "promotions";
  samples: PromotionSample[];
}

export interface LivePriceProbeResult extends ProbeResultBase {
  probeType: "live_prices";
  samples: LivePriceSample[];
}

export type ProbeResult = PromotionProbeResult | LivePriceProbeResult;

export interface SearchWindow {
  from: string;
  to: string;
  adults: number;
  rooms: number;
  nights: number;
}

export interface ProbeRunArtifact {
  runId: string;
  startedAt: string;
  finishedAt: string;
  searchWindow: SearchWindow;
  results: ProbeResult[];
}

export interface CompetitorRollup {
  competitor: CompetitorConfig;
  promotions: ProbeResult | null;
  livePrices: ProbeResult | null;
  methodSummary: "HTML required" | "Browser required" | "Mixed";
  viability: "Viable" | "Viable with browser" | "High risk" | "Blocked" | "Not run yet";
  lastObservedAt: string | null;
}
