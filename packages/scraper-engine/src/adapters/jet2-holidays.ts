import { classifyErrorBlocker, classifyHttpBlockers, makeBlocker } from "../core/blockers";
import { formatUkDate, uniqueBy } from "../core/normalizers";
import { completeRunResult } from "../core/result";
import type { CompetitorAdapter, SearchWindow } from "../core/types";
import {
  parseJet2CurrentOfferTerms,
  parseJet2DealsMarketing,
  parseJet2SmartSearchLivePrices,
} from "../parsers";

const dealsUrl = "https://www.jet2holidays.com/deals";
const promotionsUrl = "https://www.jet2holidays.com/promotions";
const smartSearchApiUrl = "https://www.jet2holidays.com/api/jet2/smartsearch/search";
const searchConfig = {
  airport: "4_98_8_118_63_9_69_1_77_7_127_99_3_5",
  destination: "8_43",
  flexi: "3",
  sortorder: "1",
};

function buildSearchPageUrl(searchWindow: SearchWindow) {
  const date = formatUkDate(new Date(`${searchWindow.fromDate}T12:00:00Z`));
  const adults = Math.max(1, searchWindow.adults);
  const occupancy = `r${adults}`;
  const params = new URLSearchParams({
    airport: searchConfig.airport,
    date,
    duration: String(searchWindow.nights),
    occupancy,
    destination: searchConfig.destination,
    flexi: searchConfig.flexi,
    sortorder: searchConfig.sortorder,
    page: "1",
  });

  return `https://www.jet2holidays.com/search/results?${params.toString()}`;
}

function buildSmartSearchApiUrl(searchWindow: SearchWindow) {
  const params = new URLSearchParams({
    departureAirportIds: searchConfig.airport,
    destinationAreaIds: searchConfig.destination,
    departureDate: searchWindow.fromDate,
    durations: String(searchWindow.nights),
    occupancies: String(Math.max(1, searchWindow.adults)),
    pageNumber: "1",
    pageSize: "24",
    sortOrder: searchConfig.sortorder,
    filters: "",
    holidayTypeId: "0",
    flexibility: "7",
    minPrice: "",
    includePriceBreakDown: "false",
    brandId: "",
    inboundFlightId: "0",
    outboundFlightId: "0",
    gtmSearchType: "Smart Search",
    searchId: "",
    applyDiscount: "true",
    occupancyOpen: "false",
    useMultiSearch: "false",
    defaultSearchParametersUsed: "false",
    inboundFlightTimes: "",
    outboundFlightTimes: "",
    flexi: searchConfig.flexi,
  });

  return `${smartSearchApiUrl}?${params.toString()}`;
}

function classifyJet2HttpBlockers(status: number, html: string) {
  return classifyHttpBlockers(status, html).filter((blocker) => {
    if (blocker.reason !== "access_denied" || status === 403) return true;

    const activeAccessDenied = /access denied|request blocked|something.?s up/i.test(html);
    return activeAccessDenied;
  });
}

export const jet2HolidaysAdapter: CompetitorAdapter = {
  slug: "jet2-holidays",
  async runPromotions(context) {
    const notes = [
      "Jet2 marketing offers use visible promo blocks from /deals plus the current offer T&C accordion on /promotions.",
      "Expired promotion sections and dynamic search placeholders are ignored.",
    ];

    try {
      const [deals, promotions] = await Promise.all([
        context.httpClient.get(dealsUrl),
        context.httpClient.get(promotionsUrl),
      ]);
      const collectedAt = new Date().toISOString();
      const records = uniqueBy(
        [
          ...(deals.status >= 200 && deals.status < 300
            ? parseJet2DealsMarketing(deals.html, deals.finalUrl, collectedAt)
            : []),
          ...(promotions.status >= 200 && promotions.status < 300
            ? parseJet2CurrentOfferTerms(promotions.html, promotions.finalUrl, collectedAt)
            : []),
        ],
        (record) => `${record.title}|${record.sourceUrl}`,
      );
      const blockers = [...classifyJet2HttpBlockers(deals.status, deals.html), ...classifyJet2HttpBlockers(promotions.status, promotions.html)];

      if (deals.status < 200 || deals.status >= 300) {
        blockers.push(makeBlocker("transport_error", `Jet2 deals page returned HTTP ${deals.status}.`));
      }

      if (promotions.status < 200 || promotions.status >= 300) {
        blockers.push(makeBlocker("transport_error", `Jet2 promotions page returned HTTP ${promotions.status}.`));
      }

      if (records.length === 0) {
        blockers.push(makeBlocker("empty_results", "Jet2 pages loaded, but no marketing offer records were extracted."));
      }

      return completeRunResult(context, {
        capability: "promotions",
        method: "http_html",
        notes,
        blockers,
        records,
        rawHtml: JSON.stringify({ deals: deals.html, promotions: promotions.html }),
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
      "Jet2 live prices use the structured Smart Search API exposed by the search results page.",
      "The API returns sellable package cards with selected flight, board, room and price options.",
    ];
    const pageUrl = buildSearchPageUrl(context.searchWindow);
    const sourceUrl = buildSmartSearchApiUrl(context.searchWindow);

    try {
      const response = await context.httpClient.get(sourceUrl, {
        headers: {
          accept: "application/json",
          referer: pageUrl,
        },
      });
      const blockers = classifyJet2HttpBlockers(response.status, response.html);
      const records =
        response.status >= 200 && response.status < 300
          ? parseJet2SmartSearchLivePrices(response.html, response.finalUrl, new Date().toISOString())
          : [];

      if (response.status < 200 || response.status >= 300) {
        blockers.push(
          makeBlocker("transport_error", `Jet2 Smart Search returned HTTP ${response.status}.`, response.html.slice(0, 500)),
        );
      }

      if (records.length === 0) {
        blockers.push(
          makeBlocker("empty_results", "Jet2 Smart Search returned no usable package offers."),
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
