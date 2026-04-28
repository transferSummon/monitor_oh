import { createBrowserSession, captureScreenshot } from "@/lib/probes/browser";
import { getCompetitorModule, type ProbeContext } from "@/lib/probes";
import { jet2HolidaysProbe } from "@/lib/probes/competitors/jet2-holidays";
import { easyJetHolidaysProbe } from "@/lib/probes/competitors/easyjet-holidays";
import { tuiProbe } from "@/lib/probes/competitors/tui";
import { sunvilProbe } from "@/lib/probes/competitors/sunvil";
import { ionianIslandHolidaysProbe } from "@/lib/probes/competitors/ionian-island-holidays";
import { loveholidaysProbe } from "@/lib/probes/competitors/loveholidays";
import { writeRunArtifact } from "@/lib/probes/storage";
import type { CompetitorSlug, ProbeRunArtifact, ProbeType, SearchWindow } from "@/lib/probes/types";

const modules = [
  jet2HolidaysProbe,
  easyJetHolidaysProbe,
  tuiProbe,
  sunvilProbe,
  ionianIslandHolidaysProbe,
  loveholidaysProbe,
];

export interface RunRequest {
  competitors?: CompetitorSlug[];
  probeTypes?: ProbeType[];
}

function buildSearchWindow(): SearchWindow {
  const from = new Date();
  from.setDate(from.getDate() + 30);

  const to = new Date();
  to.setDate(to.getDate() + 60);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    adults: 2,
    rooms: 1,
    nights: 7,
  };
}

function createRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createCompetitorContext(
  runId: string,
  searchWindow: SearchWindow,
  competitorSlug: CompetitorSlug,
): ProbeContext {
  const module = getCompetitorModule(competitorSlug, modules);

  if (!module) {
    throw new Error(`Missing competitor module for ${competitorSlug}`);
  }

  let browserSessionPromise: ReturnType<typeof createBrowserSession> | null = null;

  return {
    runId,
    searchWindow,
    competitor: module.competitor,
    getPage: async () => {
      if (!browserSessionPromise) {
        browserSessionPromise = createBrowserSession();
      }
      const session = await browserSessionPromise;
      return (await session).page;
    },
    captureScreenshot: async (page, probeType) => {
      try {
        return await captureScreenshot(page, competitorSlug, probeType, runId);
      } catch {
        return null;
      }
    },
    closeBrowser: async () => {
      if (!browserSessionPromise) return;
      const session = await browserSessionPromise;
      await session.close();
      browserSessionPromise = null;
    },
  };
}

export async function runProbeBatch(request: RunRequest = {}): Promise<ProbeRunArtifact> {
  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const searchWindow = buildSearchWindow();
  const competitorSlugs = request.competitors ?? modules.map((module) => module.competitor.slug);
  const probeTypes = request.probeTypes ?? ["promotions", "live_prices"];
  const results: ProbeRunArtifact["results"] = [];

  for (const competitorSlug of competitorSlugs) {
    const module = getCompetitorModule(competitorSlug, modules);
    if (!module) continue;

    const context = createCompetitorContext(runId, searchWindow, competitorSlug);

    try {
      for (const probeType of probeTypes) {
        const result =
          probeType === "promotions"
            ? await module.promotions(context)
            : await module.livePrices(context);
        results.push(result);
      }
    } finally {
      await context.closeBrowser();
    }
  }

  const artifact: ProbeRunArtifact = {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    searchWindow,
    results,
  };

  await writeRunArtifact(artifact);
  return artifact;
}
