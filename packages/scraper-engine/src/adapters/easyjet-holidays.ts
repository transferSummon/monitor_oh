import { classifyErrorBlocker, classifyHttpBlockers, makeBlocker } from "../core/blockers";
import { completeRunResult } from "../core/result";
import type { CompetitorAdapter, SearchWindow } from "../core/types";
import { parseEasyJetDealsMarketing, parseEasyJetPackageSearchLivePrices } from "../parsers";

const dealsUrl = "https://www.easyjet.com/en/holidays/deals";
const packageSearchUrl = "https://www.easyjet.com/holidays/_api/v1.0/search/packages";
const defaultLivePriceSearch = {
  departure: "LGW",
  geography: "GR",
  flexibleDays: "3",
  pageSize: "12",
};

function classifyEasyJetHttpBlockers(status: number, html: string) {
  return classifyHttpBlockers(status, html).filter((blocker) => {
    if (blocker.reason !== "captcha") return true;

    const activeCaptchaChallenge =
      /captcha-delivery|please enable js|enable js and disable|verify you are human|access denied/i.test(html);

    return activeCaptchaChallenge;
  });
}

function splitAdultsAcrossRooms(adults: number, rooms: number) {
  const adultCount = Math.max(1, adults);
  const roomCount = Math.min(Math.max(1, rooms), adultCount);
  const baseAdults = Math.floor(adultCount / roomCount);
  const remainder = adultCount % roomCount;

  return Array.from({ length: roomCount }, (_, index) => Math.max(1, baseAdults + (index < remainder ? 1 : 0)));
}

function buildEasyJetPackageSearchUrl(searchWindow: SearchWindow) {
  const params = new URLSearchParams({
    startDate: searchWindow.fromDate,
    endDate: searchWindow.toDate,
    duration: String(searchWindow.nights),
    flexibleDays: defaultLivePriceSearch.flexibleDays,
    departure: defaultLivePriceSearch.departure,
    geography: defaultLivePriceSearch.geography,
    automaticAllocation: "false",
    page: "1",
    pageSize: defaultLivePriceSearch.pageSize,
  });

  splitAdultsAcrossRooms(searchWindow.adults, searchWindow.rooms).forEach((adults, index) => {
    params.set(`room[${index}].adults`, String(adults));
    params.set(`room[${index}].children`, "0");
    params.set(`room[${index}].infants`, "0");
  });

  return `${packageSearchUrl}?${params.toString()}`;
}

export const easyJetHolidaysAdapter: CompetitorAdapter = {
  slug: "easyjet-holidays",
  async runPromotions(context) {
    const notes = [
      "easyJet marketing offers use the SSR promo-merch-banner cards on the public deals landing page.",
    ];

    try {
      const response = await context.httpClient.get(dealsUrl);
      const records =
        response.status >= 200 && response.status < 300
          ? parseEasyJetDealsMarketing(response.html, response.finalUrl, new Date().toISOString())
          : [];
      const blockers = classifyEasyJetHttpBlockers(response.status, response.html);

      if (response.status < 200 || response.status >= 300) {
        blockers.push(makeBlocker("transport_error", `easyJet deals page returned HTTP ${response.status}.`));
      }

      if (records.length === 0) {
        blockers.push(makeBlocker("empty_results", "easyJet deals page loaded, but no promo-merch-banner cards were extracted."));
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
      "easyJet live prices use the structured package-search API exposed by the holidays frontend.",
      "The API requires a geography; this monitor currently samples Greece package inventory from London Gatwick.",
    ];
    const sourceUrl = buildEasyJetPackageSearchUrl(context.searchWindow);

    try {
      const response = await context.httpClient.get(sourceUrl, {
        headers: {
          accept: "application/json",
          referer: "https://www.easyjet.com/en/holidays",
        },
      });
      const blockers = classifyHttpBlockers(response.status, response.html);
      const records =
        response.status >= 200 && response.status < 300
          ? parseEasyJetPackageSearchLivePrices(response.html, response.finalUrl, new Date().toISOString())
          : [];

      if (response.status < 200 || response.status >= 300) {
        blockers.push(
          makeBlocker(
            "transport_error",
            `easyJet package search returned HTTP ${response.status}.`,
            response.html.slice(0, 500),
          ),
        );
      }

      if (records.length === 0) {
        blockers.push(
          makeBlocker("empty_results", "easyJet package-search API returned no usable hotel package offers."),
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
