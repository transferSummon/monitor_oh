import { classifyErrorBlocker, makeBlocker } from "../core/blockers";
import { completeRunResult } from "../core/result";
import type { CompetitorAdapter } from "../core/types";
import { parseTuiLivePrices, parseTuiPromotions } from "../parsers";

const promotionsUrl = "https://www.tui.co.uk/holidays/destination-deals";
const livePricesUrl =
  "https://www.tui.co.uk/destinations/deals/summer-handpicked-deals?vlid=T%7CL1%7CB1%7CAV%7CNA%7CNA%7CNO%7CNO%7CNO%7CBAU%7C546";

export const tuiAdapter: CompetitorAdapter = {
  slug: "tui",
  async runPromotions(context) {
    const notes = [
      "TUI is browser-required because direct server-side requests return Access Denied.",
    ];

    try {
      const document = await context.browserPool.getDocument(context.competitor.slug);
      await document.goto(promotionsUrl, { timeoutMs: 60_000, waitMs: 3_500 });
      await document.acceptCookies();
      const html = await document.content();
      const screenshot = await document.takeScreenshot();
      const records = parseTuiPromotions(html, await document.currentUrl(), new Date().toISOString());
      const blockers = records.length === 0 ? [makeBlocker("empty_results", "TUI rendered promotions page loaded, but no deal cards were extracted.")] : [];

      return completeRunResult(context, {
        capability: "promotions",
        method: "browser_html",
        notes,
        blockers,
        records,
        rawHtml: html,
        screenshot,
      });
    } catch (error) {
      return completeRunResult(context, {
        capability: "promotions",
        method: "browser_html",
        notes,
        blockers: [classifyErrorBlocker(error)],
        records: [],
        forceFailed: true,
      });
    }
  },
  async runLivePrices(context) {
    const notes = [
      "TUI live prices use a maintained rendered deals/results URL rather than reverse-engineering hidden APIs.",
    ];

    try {
      const document = await context.browserPool.getDocument(context.competitor.slug);
      await document.goto(livePricesUrl, { timeoutMs: 60_000, waitMs: 3_500 });
      await document.acceptCookies();
      const html = await document.content();
      const screenshot = await document.takeScreenshot();
      const records = parseTuiLivePrices(html, await document.currentUrl(), new Date().toISOString());
      const blockers = records.length === 0 ? [makeBlocker("empty_results", "TUI rendered successfully, but no stable package price cards were extracted.")] : [];

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
