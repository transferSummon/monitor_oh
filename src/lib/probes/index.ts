import type { Page } from "playwright";

import type {
  CompetitorConfig,
  CompetitorSlug,
  ProbeResult,
  ProbeType,
  SearchWindow,
} from "@/lib/probes/types";

export interface ProbeContext {
  runId: string;
  competitor: CompetitorConfig;
  searchWindow: SearchWindow;
  getPage: () => Promise<Page>;
  captureScreenshot: (page: Page, probeType: ProbeType) => Promise<string | null>;
  closeBrowser: () => Promise<void>;
}

export interface CompetitorProbeModule {
  competitor: CompetitorConfig;
  promotions: (context: ProbeContext) => Promise<ProbeResult>;
  livePrices: (context: ProbeContext) => Promise<ProbeResult>;
}

export function getCompetitorModule(
  slug: CompetitorSlug,
  modules: CompetitorProbeModule[],
) {
  return modules.find((module) => module.competitor.slug === slug) ?? null;
}
