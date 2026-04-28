import { classifyErrorBlocker, classifyHttpBlockers, makeBlocker } from "../core/blockers";
import { completeRunResult } from "../core/result";
import type { CompetitorAdapter } from "../core/types";
import { extractFormFields, parseSunvilLivePrices, parseSunvilPromotions } from "../parsers";

const offersUrl = "https://www.sunvil.co.uk/offers";
const discoverUrl = "https://www.sunvil.co.uk/results/discover";

export const sunvilAdapter: CompetitorAdapter = {
  slug: "sunvil",
  async runPromotions(context) {
    const notes = [
      "Sunvil promotions are HTTP-first from the public /offers page.",
    ];

    try {
      const response = await context.httpClient.get(offersUrl);
      const records = parseSunvilPromotions(response.html, new Date().toISOString());
      const blockers = classifyHttpBlockers(response.status, response.html);

      if (records.length === 0) {
        blockers.push(makeBlocker("empty_results", "Sunvil offers page loaded, but no offer cards were extracted."));
      }

      return completeRunResult(context, {
        capability: "promotions",
        method: "http_html",
        notes,
        blockers,
        records,
        rawHtml: response.html,
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
      "Sunvil live prices try the public discover form flow first, preserving cookies and hidden fields.",
    ];

    try {
      const seed = await context.httpClient.get(offersUrl);
      const formFields = extractFormFields(seed.html, "#DiscoverForm");
      formFields.set("DiscoverAdults", String(context.searchWindow.adults));
      formFields.set("DiscoverChildren", "0");
      formFields.set("DiscoverInfants", "0");
      formFields.set("DiscoverPassengers", `${context.searchWindow.adults} Adults`);
      const response = await context.httpClient.postForm(discoverUrl, formFields);
      let records = parseSunvilLivePrices(response.html, response.finalUrl, new Date().toISOString());
      const blockers = [...classifyHttpBlockers(seed.status, seed.html), ...classifyHttpBlockers(response.status, response.html)];

      if (records.length > 0) {
        notes.push("Sunvil returned usable HTML directly from the posted discover form.");
        return completeRunResult(context, {
          capability: "live-prices",
          method: "http_form",
          notes,
          blockers,
          records,
          rawHtml: response.html,
        });
      }

      notes.push("HTTP form flow did not return stable cards, so the adapter switched to browser fallback.");
      const document = await context.browserPool.getDocument(context.competitor.slug);
      await document.goto(offersUrl, { timeoutMs: 60_000, waitMs: 3_000 });
      await document.acceptCookies();
      const html = await document.content();
      const screenshot = await document.takeScreenshot();
      records = parseSunvilLivePrices(html, await document.currentUrl(), new Date().toISOString());

      if (records.length === 0) {
        blockers.push(makeBlocker("empty_results", "Sunvil browser fallback loaded, but no stable price cards were extracted."));
      }

      return completeRunResult(context, {
        capability: "live-prices",
        method: "browser_form",
        notes,
        blockers,
        records,
        rawHtml: html,
        screenshot,
      });
    } catch (error) {
      return completeRunResult(context, {
        capability: "live-prices",
        method: "http_form",
        notes,
        blockers: [classifyErrorBlocker(error)],
        records: [],
        forceFailed: true,
      });
    }
  },
};
