import { getCompetitor, COMPETITORS } from "./competitors";
import { classifyErrorBlocker, makeBlocker } from "./blockers";
import { PlaywrightBrowserPool } from "./browser";
import { DefaultHttpClient } from "./http-client";
import { completeRunResult } from "./result";
import { buildSearchWindow, createRunId } from "./search-window";
import { LocalArtifactWriter } from "./writer";
import type {
  BrowserPool,
  Capability,
  CompetitorAdapter,
  CompetitorSlug,
  HttpClient,
  ScrapeRunResult,
  ScrapeRunSummary,
  SearchWindow,
} from "./types";

export interface RunOptions {
  competitor: CompetitorSlug;
  capability: Capability;
  adapters: CompetitorAdapter[];
  runId?: string;
  startedAt?: string;
  searchWindow?: SearchWindow;
  httpClient?: HttpClient;
  browserPool?: BrowserPool;
  writer?: LocalArtifactWriter;
}

export interface RunAllOptions {
  adapters: CompetitorAdapter[];
  competitors?: CompetitorSlug[];
  capabilities?: Capability[];
  searchWindow?: SearchWindow;
  writer?: LocalArtifactWriter;
}

function getAdapter(adapters: CompetitorAdapter[], slug: CompetitorSlug) {
  const adapter = adapters.find((entry) => entry.slug === slug);

  if (!adapter) {
    throw new Error(`Missing adapter for ${slug}`);
  }

  return adapter;
}

export async function runScrape(options: RunOptions) {
  const runId = options.runId ?? createRunId();
  const startedAt = options.startedAt ?? new Date().toISOString();
  const searchWindow = options.searchWindow ?? buildSearchWindow();
  const writer = options.writer ?? new LocalArtifactWriter();
  const browserPool = options.browserPool ?? new PlaywrightBrowserPool();
  const adapter = getAdapter(options.adapters, options.competitor);
  const context = {
    runId,
    startedAt,
    competitor: getCompetitor(options.competitor),
    searchWindow,
    httpClient: options.httpClient ?? new DefaultHttpClient(),
    browserPool,
    writer,
    artifactWriter: writer,
  };

  try {
    const result =
      options.capability === "promotions"
        ? await adapter.runPromotions(context)
        : await adapter.runLivePrices(context);
    await writer.writeSummary({
      runId,
      startedAt,
      finishedAt: result.finishedAt,
      searchWindow,
      results: [result],
    });
    return result;
  } catch (error) {
    const result = await completeRunResult(context, {
      capability: options.capability,
      method: "http_html",
      notes: ["The adapter threw before returning a classified run result."],
      blockers: [classifyErrorBlocker(error), makeBlocker("selector_drift", "Unhandled adapter failure.")],
      records: [],
      forceFailed: true,
    });
    await writer.writeSummary({
      runId,
      startedAt,
      finishedAt: result.finishedAt,
      searchWindow,
      results: [result],
    });
    return result;
  } finally {
    await browserPool.close();
  }
}

export async function runAllScrapes(options: RunAllOptions) {
  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const searchWindow = options.searchWindow ?? buildSearchWindow();
  const writer = options.writer ?? new LocalArtifactWriter();
  const results: ScrapeRunResult[] = [];
  const competitorSlugs = options.competitors ?? COMPETITORS.map((entry) => entry.slug);
  const capabilities = options.capabilities ?? ["promotions", "live-prices"];

  for (const competitor of competitorSlugs) {
    for (const capability of capabilities) {
      results.push(
        await runScrape({
          competitor,
          capability,
          adapters: options.adapters,
          runId,
          startedAt,
          searchWindow,
          writer,
        }),
      );
    }
  }

  const summary: ScrapeRunSummary = {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    searchWindow,
    results,
  };

  summary.summaryPath = await writer.writeSummary(summary);
  return summary;
}

export async function inspectLatestRun(writer = new LocalArtifactWriter()) {
  return writer.readLatestSummary();
}
