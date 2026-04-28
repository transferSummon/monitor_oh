import { classifyErrorBlocker, classifyHttpBlockers, makeBlocker } from "../core/blockers";
import { completeRunResult } from "../core/result";
import type { CompetitorAdapter } from "../core/types";
import { parseIonianLivePrices, parseIonianPromotions } from "../parsers";

const promotionsUrl = "https://www.ionianislandholidays.com/special-offers";
const livePriceUrls = [
  "https://www.ionianislandholidays.com/search/properties?duration=7&airport=none&refine=collections%3A84810%7Ctype%3AV%2CA",
  "https://www.ionianislandholidays.com/collection/apartments",
];

export const ionianIslandHolidaysAdapter: CompetitorAdapter = {
  slug: "ionian-island-holidays",
  async runPromotions(context) {
    const notes = [
      "Ionian promotions are HTTP-first from the public special-offers hub and linked offer pages.",
    ];

    try {
      const response = await context.httpClient.get(promotionsUrl);
      const records = parseIonianPromotions(response.html, new Date().toISOString());
      const blockers = classifyHttpBlockers(response.status, response.html);

      if (records.length === 0) {
        blockers.push(makeBlocker("empty_results", "Ionian special-offers page loaded, but no offer cards were extracted."));
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
      "Ionian live prices are HTTP-first using real linked query patterns from /search/properties.",
    ];

    try {
      let html = "";
      let finalUrl = livePriceUrls[0];
      let records: ReturnType<typeof parseIonianLivePrices> = [];
      const blockers = [];

      for (const url of livePriceUrls) {
        const response = await context.httpClient.get(url);
        blockers.push(...classifyHttpBlockers(response.status, response.html));
        html = response.html;
        finalUrl = response.finalUrl;
        records = parseIonianLivePrices(response.html, response.finalUrl, new Date().toISOString());

        if (records.length > 0) {
          if (url !== livePriceUrls[0]) {
            notes.push(`Fell back to public listing page: ${url}`);
          }
          break;
        }
      }

      if (records.length === 0) {
        blockers.push(makeBlocker("empty_results", "Ionian listing pages loaded, but no stable price cards were extracted."));
      }

      return completeRunResult(context, {
        capability: "live-prices",
        method: "http_html",
        notes,
        blockers,
        records,
        rawHtml: html,
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
