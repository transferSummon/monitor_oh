import { classifyErrorBlocker, classifyHttpBlockers, makeBlocker } from "../core/blockers";
import { formatUkDate } from "../core/normalizers";
import { completeRunResult } from "../core/result";
import type { CompetitorAdapter } from "../core/types";
import { parseJet2LivePrices, parseJet2Promotions } from "../parsers";

const dealsUrl = "https://www.jet2holidays.com/deals";
const promotionsUrl = "https://www.jet2holidays.com/promotions";
const searchConfig = {
  airport: "4_98_8_118_63_9_69_1_77_7_127_99_3_5",
  destination: "8_43",
  flexi: "3",
  sortorder: "1",
};

function buildSearchUrl(fromDate: string, nights: number, adults: number) {
  const date = formatUkDate(new Date(`${fromDate}T12:00:00Z`));
  const occupancy = adults <= 0 ? "r2" : `r${adults}`;
  const params = new URLSearchParams({
    airport: searchConfig.airport,
    date,
    duration: String(nights),
    occupancy,
    destination: searchConfig.destination,
    flexi: searchConfig.flexi,
    sortorder: searchConfig.sortorder,
    page: "1",
  });

  return `https://www.jet2holidays.com/search/results?${params.toString()}`;
}

export const jet2HolidaysAdapter: CompetitorAdapter = {
  slug: "jet2-holidays",
  async runPromotions(context) {
    const notes = [
      "Jet2 promotions use HTTP-first extraction from the public deals and promotions pages.",
    ];

    try {
      const [deals, promotions] = await Promise.all([
        context.httpClient.get(dealsUrl),
        context.httpClient.get(promotionsUrl),
      ]);
      const combinedHtml = `${deals.html}\n${promotions.html}`;
      const records = parseJet2Promotions(combinedHtml, new Date().toISOString());
      const blockers = [...classifyHttpBlockers(deals.status, deals.html), ...classifyHttpBlockers(promotions.status, promotions.html)];

      if (records.length === 0) {
        blockers.push(makeBlocker("empty_results", "Jet2 pages loaded, but no promotion cards were extracted."));
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
      "Jet2 live prices are HTTP-first from a parameterized search/results URL.",
      "Browser fallback is used immediately on transport failure, anti-bot content, or empty card extraction.",
    ];
    const sourceUrl = buildSearchUrl(
      context.searchWindow.fromDate,
      context.searchWindow.nights,
      context.searchWindow.adults,
    );

    try {
      const response = await context.httpClient.get(sourceUrl);
      const httpBlockers = classifyHttpBlockers(response.status, response.html);
      const records = parseJet2LivePrices(response.html, response.finalUrl, new Date().toISOString());

      if (records.length > 0 && httpBlockers.length === 0) {
        return completeRunResult(context, {
          capability: "live-prices",
          method: "http_html",
          notes,
          blockers: [],
          records,
          rawHtml: response.html,
        });
      }

      notes.push("HTTP extraction was insufficient, so the adapter switched to browser fallback.");
      const document = await context.browserPool.getDocument(context.competitor.slug);
      await document.goto(sourceUrl, { timeoutMs: 60_000, waitMs: 3_500 });
      await document.acceptCookies();
      const html = await document.content();
      const screenshot = await document.takeScreenshot();
      const browserRecords = parseJet2LivePrices(html, await document.currentUrl(), new Date().toISOString());
      const blockers = browserRecords.length > 0 ? [] : [...httpBlockers, makeBlocker("empty_results", "Jet2 search results loaded, but no stable price cards were extracted.")];

      return completeRunResult(context, {
        capability: "live-prices",
        method: "browser_html",
        notes,
        blockers,
        records: browserRecords,
        rawHtml: html,
        screenshot,
      });
    } catch (error) {
      return completeRunResult(context, {
        capability: "live-prices",
        method: "http_html",
        notes,
        blockers: [classifyErrorBlocker(error)],
        records: [],
        forceFailed: true,
      });
    }
  },
};
