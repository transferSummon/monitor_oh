import type { Page } from "playwright";

import type { Competitor, CompetitorSlug } from "./competitors";

export type { Competitor, CompetitorSlug } from "./competitors";

export type Capability = "promotions" | "live-prices";
export type ScrapeMethod = "http_html" | "http_form" | "browser_html" | "browser_form";
export type ScrapeStatus = "success" | "partial" | "blocked" | "failed";
export type BlockerReason =
  | "access_denied"
  | "captcha"
  | "selector_drift"
  | "empty_results"
  | "timeout"
  | "transport_error";

export interface SearchWindow {
  fromDate: string;
  toDate: string;
  adults: number;
  rooms: number;
  nights: number;
  timezone: "Europe/London";
}

export interface Blocker {
  reason: BlockerReason;
  message: string;
  details?: string;
}

export interface ArtifactPaths {
  resultJson: string;
  rawHtml: string | null;
  screenshot: string | null;
  recordsJson: string | null;
  blockersJson: string | null;
}

export interface RecordEvidence {
  sourceUrl: string;
  finalUrl: string;
  rawHtmlPath: string | null;
  screenshotPath: string | null;
  selector: string | null;
}

export interface PromotionRecord {
  kind: "promotion";
  competitor: CompetitorSlug;
  title: string;
  subtitle: string | null;
  priceText: string | null;
  discountText: string | null;
  destinationText: string | null;
  sourceUrl: string | null;
  imageUrl?: string | null;
  offerType?: string | null;
  promoCode?: string | null;
  validityText?: string | null;
  collectedAt: string;
  evidence: RecordEvidence;
}

export interface LivePriceRecord {
  kind: "live-price";
  competitor: CompetitorSlug;
  propertyName: string;
  destination: string | null;
  travelDate: string | null;
  nights: string | null;
  boardBasis: string | null;
  priceText: string | null;
  currency: string | null;
  sourceUrl: string | null;
  imageUrl?: string | null;
  collectedAt: string;
  evidence: RecordEvidence;
}

export type ScrapeRecord = PromotionRecord | LivePriceRecord;

export interface ScrapeRunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  competitor: CompetitorSlug;
  capability: Capability;
  method: ScrapeMethod;
  status: ScrapeStatus;
  notes: string[];
  blockers: Blocker[];
  records: ScrapeRecord[];
  artifactPaths: ArtifactPaths;
}

export interface ScrapeRunSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  searchWindow: SearchWindow;
  results: ScrapeRunResult[];
  summaryPath?: string;
}

export interface HttpResponseData {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  headers: Record<string, string>;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
}

export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponseData>;
  postForm(
    url: string,
    form: URLSearchParams | Record<string, string>,
    options?: HttpRequestOptions,
  ): Promise<HttpResponseData>;
  postJson(url: string, body: unknown, options?: HttpRequestOptions): Promise<HttpResponseData>;
}

export interface BrowserDocument {
  goto(url: string, options?: { timeoutMs?: number; waitMs?: number }): Promise<void>;
  acceptCookies(): Promise<void>;
  content(): Promise<string>;
  currentUrl(): Promise<string>;
  takeScreenshot(): Promise<Buffer>;
  collectHrefs(selector: string): Promise<string[]>;
  click(selector: string): Promise<boolean>;
  fill(selector: string, value: string): Promise<boolean>;
  selectOption(selector: string, value: string): Promise<boolean>;
  rawPage(): Page | null;
}

export interface BrowserPool {
  getDocument(competitor: CompetitorSlug): Promise<BrowserDocument>;
  close(): Promise<void>;
}

export interface ArtifactWriter {
  getArtifactPaths(runId: string, competitor: CompetitorSlug, capability: Capability): ArtifactPaths;
  writeRawHtml(relativePath: string, html: string): Promise<void>;
  writeScreenshot(relativePath: string, data: Buffer): Promise<void>;
  writeSummary(summary: ScrapeRunSummary): Promise<string>;
  readLatestSummary(): Promise<ScrapeRunSummary | null>;
}

export interface Writer {
  writeRun(result: ScrapeRunResult): Promise<void>;
  writeRecords(result: ScrapeRunResult): Promise<void>;
  writeBlocker(result: ScrapeRunResult): Promise<void>;
}

export interface ScrapeContext {
  runId: string;
  startedAt: string;
  competitor: Competitor;
  searchWindow: SearchWindow;
  httpClient: HttpClient;
  browserPool: BrowserPool;
  writer: Writer;
  artifactWriter: ArtifactWriter;
}

export interface CompetitorAdapter {
  slug: CompetitorSlug;
  runPromotions(context: ScrapeContext): Promise<ScrapeRunResult>;
  runLivePrices(context: ScrapeContext): Promise<ScrapeRunResult>;
}

export interface CompleteResultInput {
  capability: Capability;
  method: ScrapeMethod;
  notes?: string[];
  blockers?: Blocker[];
  records: ScrapeRecord[];
  rawHtml?: string | null;
  screenshot?: Buffer | null;
  forceFailed?: boolean;
}
