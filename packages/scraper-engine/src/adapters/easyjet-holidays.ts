import { classifyErrorBlocker, classifyHttpBlockers, makeBlocker } from "../core/blockers";
import { completeRunResult } from "../core/result";
import type { BrowserDocument, CompetitorAdapter, SearchWindow } from "../core/types";
import { parseEasyJetLivePrices, parseEasyJetPromotions } from "../parsers";

const dealsUrl = "https://www.easyjet.com/en/holidays/deals";
const categoryUrls = [
  "https://www.easyjet.com/en/holidays/deals/summer-holidays",
  "https://www.easyjet.com/en/holidays/deals/last-minute-holidays",
];

async function attemptEasyJetSearch(document: BrowserDocument, searchWindow: SearchWindow) {
  await document.goto("https://www.easyjet.com/en/holidays", { timeoutMs: 60_000, waitMs: 3_000 });
  await document.acceptCookies();

  const attemptedSelectors = [
    () => document.click("[data-tid='searchButton']"),
    () => document.fill("input[name*='date']", searchWindow.fromDate),
    () => document.fill("input[placeholder*='When']", searchWindow.fromDate),
    () => document.selectOption("select[name*='duration']", String(searchWindow.nights)),
    () => document.click("button[type='submit']"),
  ];

  for (const attempt of attemptedSelectors) {
    await attempt().catch(() => false);
  }

  const currentUrl = await document.currentUrl();
  const html = await document.content();
  return { currentUrl, html };
}

export const easyJetHolidaysAdapter: CompetitorAdapter = {
  slug: "easyjet-holidays",
  async runPromotions(context) {
    const notes = [
      "easyJet promotions use HTTP HTML from deals landing pages and category pages.",
    ];

    try {
      const responses = await Promise.all([context.httpClient.get(dealsUrl), ...categoryUrls.map((url) => context.httpClient.get(url))]);
      const combinedHtml = responses.map((response) => response.html).join("\n");
      const records = parseEasyJetPromotions(combinedHtml, new Date().toISOString());
      const blockers = responses.flatMap((response) => classifyHttpBlockers(response.status, response.html));

      if (records.length === 0) {
        blockers.push(makeBlocker("empty_results", "easyJet deals pages loaded, but no promotion cards were extracted."));
      }

      return completeRunResult(context, {
        capability: "promotions",
        method: "http_html",
        notes,
        blockers,
        records,
        rawHtml: combinedHtml,
      });
    } catch (error) {
      return completeRunResult(context, {
        capability: "promotions",
        method: "http_html",
        notes,
        blockers: [classifyErrorBlocker(error)],
        records: [],
        forceFailed: true,
      });
    }
  },
  async runLivePrices(context) {
    const notes = [
      "easyJet live prices are browser-driven because the holidays experience is heavily client-rendered.",
    ];

    try {
      const document = await context.browserPool.getDocument(context.competitor.slug);
      let currentUrl = "https://www.easyjet.com/en/holidays";
      let html = "";

      try {
        const attempted = await attemptEasyJetSearch(document, context.searchWindow);
        currentUrl = attempted.currentUrl;
        html = attempted.html;
      } catch {
        notes.push("The broad search flow was brittle in this session, so the adapter fell back to rendered deal pages.");
      }

      let records = parseEasyJetLivePrices(html, currentUrl, new Date().toISOString());

      if (records.length === 0) {
        for (const url of categoryUrls) {
          await document.goto(url, { timeoutMs: 60_000, waitMs: 3_000 });
          html = await document.content();
          currentUrl = await document.currentUrl();
          records = parseEasyJetLivePrices(html, currentUrl, new Date().toISOString());

          if (records.length > 0) {
            notes.push(`Fell back to rendered category page: ${url}`);
            break;
          }
        }
      }

      const screenshot = await document.takeScreenshot();
      const blockers = records.length === 0 ? [makeBlocker("empty_results", "easyJet rendered pages loaded, but no stable hotel price cards were extracted.")] : [];

      return completeRunResult(context, {
        capability: "live-prices",
        method: "browser_html",
        notes,
        blockers,
        records,
        rawHtml: html,
        screenshot,
      });
    } catch (error) {
      return completeRunResult(context, {
        capability: "live-prices",
        method: "browser_html",
        notes,
        blockers: [classifyErrorBlocker(error)],
        records: [],
        forceFailed: true,
      });
    }
  },
};
