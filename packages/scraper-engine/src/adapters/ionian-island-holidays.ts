import { classifyErrorBlocker, classifyHttpBlockers, makeBlocker } from "../core/blockers";
import { completeRunResult } from "../core/result";
import type { CompetitorAdapter, SearchWindow } from "../core/types";
import { parseIonianPropertySearchLivePrices, parseIonianPromotions } from "../parsers";

const promotionsUrl = "https://www.ionianislandholidays.com/special-offers";
const searchUrl = "https://www.ionianislandholidays.com/search/properties";
const propertySearchActionUrl = "https://www.ionianislandholidays.com/actions/ionian/property/search";
const defaultSearch = {
  airport: "none",
  collectionId: 84810,
  types: ["V", "A"],
  perPage: 12,
};

function buildIonianSearchUrl(searchWindow: SearchWindow) {
  const params = new URLSearchParams({
    duration: String(searchWindow.nights),
    airport: defaultSearch.airport,
    refine: `collections:${defaultSearch.collectionId}|type:${defaultSearch.types.join(",")}`,
  });

  return `${searchUrl}?${params.toString()}`;
}

function buildIonianPropertySearchPayload(searchWindow: SearchWindow) {
  return {
    duration: searchWindow.nights,
    airport: defaultSearch.airport,
    page: 1,
    adults: Math.max(1, searchWindow.adults),
    children: 0,
    infants: 0,
    isFlexible: true,
    perPage: defaultSearch.perPage,
    imageTransform: "gallery",
    refinements: {
      collections: [defaultSearch.collectionId],
      type: defaultSearch.types,
    },
    baseRefinements: null,
  };
}

function extractCsrfToken(html: string) {
  return html.match(/"csrfToken":"([^"]+)"/)?.[1] ?? html.match(/csrfToken\s*:\s*["']([^"']+)["']/)?.[1] ?? null;
}

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
      "Ionian live prices use the structured property-search action API exposed by the search page.",
    ];
    const seedUrl = buildIonianSearchUrl(context.searchWindow);

    try {
      const seed = await context.httpClient.get(seedUrl);
      const blockers = classifyHttpBlockers(seed.status, seed.html);
      const csrfToken = extractCsrfToken(seed.html);

      if (!csrfToken) {
        blockers.push(makeBlocker("selector_drift", "Ionian search page did not expose APP_GLOBALS.csrfToken."));

        return completeRunResult(context, {
          capability: "live-prices",
          method: "http_html",
          notes,
          blockers,
          records: [],
          rawHtml: seed.html,
        });
      }

      const response = await context.httpClient.postJson(
        propertySearchActionUrl,
        buildIonianPropertySearchPayload(context.searchWindow),
        {
          headers: {
            accept: "application/json",
            origin: "https://www.ionianislandholidays.com",
            referer: seed.finalUrl,
            "x-csrf-token": csrfToken,
          },
        },
      );
      blockers.push(...classifyHttpBlockers(response.status, response.html));
      const records =
        response.status >= 200 && response.status < 300
          ? parseIonianPropertySearchLivePrices(response.html, response.finalUrl, new Date().toISOString())
          : [];

      if (response.status < 200 || response.status >= 300) {
        blockers.push(
          makeBlocker(
            "transport_error",
            `Ionian property search returned HTTP ${response.status}.`,
            response.html.slice(0, 500),
          ),
        );
      }

      if (records.length === 0) {
        blockers.push(
          makeBlocker("empty_results", "Ionian property-search API returned no usable property/departure offers."),
        );
      }

      return completeRunResult(context, {
        capability: "live-prices",
        method: "http_html",
        notes,
        blockers,
        records,
        rawHtml: response.html,
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
