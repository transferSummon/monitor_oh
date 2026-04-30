import { classifyErrorBlocker, classifyHttpBlockers, makeBlocker } from "../core/blockers";
import { completeRunResult } from "../core/result";
import type { Blocker, CompetitorAdapter } from "../core/types";
import { parseTuiDestinationDealsMarketing, parseTuiProductCardsLivePrices } from "../parsers";

const promotionsUrl = "https://www.tui.co.uk/holidays/destination-deals";
const livePricesUrl =
  "https://www.tui.co.uk/destinations/deals/summer-handpicked-deals?vlid=T%7CL1%7CB1%7CAV%7CNA%7CNA%7CNO%7CNO%7CNO%7CBAU%7C546";
const productCardsGraphqlUrl = "https://mwa.tui.com/browse/mwa/product-cards-production/graphql";
const productCardsPageUrl = "https://www.tui.co.uk/destinations/deals/summer-handpicked-deals";
const productCardsContext = {
  env: "Live",
  locale: "en-GB",
  market: "UK",
  productType: "packages",
};

const getDealsQuery = `
  query getDeals($params: GetDealsParams!) {
    getDeals(params: $params) {
      pagination { total start end }
      data {
        code
        accommodationCode
        accomStartDate
        roomType
        roomTypeCode
        packageId
        bookingPageUrl
        sourceSystem
        label
        boardCode
        generalInfo { resortName country destination resort continent }
        tripDetails {
          date
          duration
          departurePoint
          arrivalPoint
          arrivalPointName
          accommodationType
          transportType
          transferIncluded
        }
        priceDetails { price totalPrice pricePP totalPricePP }
        numberOfAdults
        numberOfChildren
        paxDetails { adults children infants rooms }
      }
    }
  }
`;

const getDealsInfoQuery = `
  query getDealsInfo($params: GetDealsInfoParams!) {
    getDealsInfo(params: $params) {
      dealsInfo {
        code
        roomType
        sliderData {
          mainImageUrl
          mainImageAlt
          secondaryImagesDetails { url alt }
          imagesCount
        }
        geo { resortId countryId destinationId regionId regionName arrivalPort ports }
        productLabel { name url }
      }
    }
  }
`;

function buildGetDealsVariables() {
  return {
    params: {
      pageSize: 12,
      pageNumber: 1,
      sortingType: "default",
      pageID: "summer-handpicked-deals",
      destinations: "",
      context: productCardsContext,
      filters: {},
      defaultFilters: null,
    },
  };
}

function buildGetDealsInfoVariables(deals: Record<string, unknown>[]) {
  return {
    params: {
      context: productCardsContext,
      deals: deals.map((deal) => {
        const tripDetails = asRecord(deal.tripDetails);

        return {
          code: readString(deal, "code") ?? "",
          roomTypeCode: readString(deal, "roomTypeCode"),
          sourceSystem: readString(deal, "sourceSystem"),
          date: readString(tripDetails, "date") ?? readString(deal, "accomStartDate") ?? "",
        };
      }),
      isExtendedSliderData: true,
    },
  };
}

function parseJsonObject(payload: string) {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function extractDeals(payload: Record<string, unknown> | null) {
  const data = asRecord(asRecord(payload?.data)?.getDeals)?.data;
  if (!Array.isArray(data)) return [];
  return data.map(asRecord).filter((deal): deal is Record<string, unknown> => Boolean(deal));
}

function extractDealsInfo(payload: Record<string, unknown> | null) {
  const dealsInfo = asRecord(asRecord(payload?.data)?.getDealsInfo)?.dealsInfo;
  if (!Array.isArray(dealsInfo)) return [];
  return dealsInfo.map(asRecord).filter((info): info is Record<string, unknown> => Boolean(info));
}

export const tuiAdapter: CompetitorAdapter = {
  slug: "tui",
  async runPromotions(context) {
    const notes = [
      "TUI marketing offers use the public Deals by Destination landing page component structure.",
      "The scraper reads hero, article, icon, haul-tab and budget deal cards; browser rendering is only used as a fallback.",
    ];

    try {
      const httpBlockers: Blocker[] = [];

      try {
        const response = await context.httpClient.get(promotionsUrl);
        const records =
          response.status >= 200 && response.status < 300
            ? parseTuiDestinationDealsMarketing(response.html, response.finalUrl, new Date().toISOString())
            : [];
        const blockers = classifyHttpBlockers(response.status, response.html);

        if (response.status < 200 || response.status >= 300) {
          blockers.push(makeBlocker("transport_error", `TUI destination deals page returned HTTP ${response.status}.`));
        }

        if (records.length > 0) {
          return completeRunResult(context, {
            capability: "promotions",
            method: "http_html",
            notes,
            blockers,
            records,
            rawHtml: response.html,
          });
        }

        httpBlockers.push(...blockers);
      } catch (error) {
        httpBlockers.push(classifyErrorBlocker(error));
      }

      const document = await context.browserPool.getDocument(context.competitor.slug);
      await document.goto(promotionsUrl, { timeoutMs: 60_000, waitMs: 3_500 });
      await document.acceptCookies();
      const html = await document.content();
      const screenshot = await document.takeScreenshot();
      const records = parseTuiDestinationDealsMarketing(html, await document.currentUrl(), new Date().toISOString());
      const blockers =
        records.length === 0
          ? [...httpBlockers, makeBlocker("empty_results", "TUI rendered destination deals page loaded, but no deal cards were extracted.")]
          : [];

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
      "TUI live prices use the structured Product Cards GraphQL API exposed by the deals page.",
    ];

    try {
      const requestHeaders = {
        accept: "application/json",
        "x-request-source": "tui-product-cards",
        "x-request-page-url": productCardsPageUrl,
        "x-api-key": "__API_KEY__",
      };
      const dealsResponse = await context.httpClient.postJson(
        productCardsGraphqlUrl,
        { query: getDealsQuery, variables: buildGetDealsVariables() },
        { headers: requestHeaders },
      );
      const blockers = classifyHttpBlockers(dealsResponse.status, dealsResponse.html);
      const dealsPayload = parseJsonObject(dealsResponse.html);
      const deals = dealsResponse.status >= 200 && dealsResponse.status < 300 ? extractDeals(dealsPayload) : [];
      let dealsInfo: Record<string, unknown>[] = [];
      let rawPayload: unknown = { getDeals: dealsPayload };

      if (dealsResponse.status < 200 || dealsResponse.status >= 300) {
        blockers.push(
          makeBlocker("transport_error", `TUI Product Cards getDeals returned HTTP ${dealsResponse.status}.`),
        );
      }

      if (Array.isArray(dealsPayload?.errors) && dealsPayload.errors.length > 0) {
        blockers.push(makeBlocker("selector_drift", "TUI Product Cards getDeals returned GraphQL errors."));
      }

      if (deals.length > 0) {
        const infoResponse = await context.httpClient.postJson(
          productCardsGraphqlUrl,
          { query: getDealsInfoQuery, variables: buildGetDealsInfoVariables(deals) },
          { headers: requestHeaders },
        );
        blockers.push(...classifyHttpBlockers(infoResponse.status, infoResponse.html));
        const infoPayload = parseJsonObject(infoResponse.html);
        rawPayload = { getDeals: dealsPayload, getDealsInfo: infoPayload };

        if (infoResponse.status >= 200 && infoResponse.status < 300) {
          dealsInfo = extractDealsInfo(infoPayload);
        } else {
          blockers.push(
            makeBlocker("transport_error", `TUI Product Cards getDealsInfo returned HTTP ${infoResponse.status}.`),
          );
        }

        if (Array.isArray(infoPayload?.errors) && infoPayload.errors.length > 0) {
          blockers.push(makeBlocker("selector_drift", "TUI Product Cards getDealsInfo returned GraphQL errors."));
        }
      }

      const combinedPayload = JSON.stringify({ deals, dealsInfo });
      const records = parseTuiProductCardsLivePrices(combinedPayload, productCardsGraphqlUrl, new Date().toISOString());

      if (records.length === 0) {
        blockers.push(
          makeBlocker("empty_results", "TUI Product Cards GraphQL returned no usable package offers."),
        );
      }

      return completeRunResult(context, {
        capability: "live-prices",
        method: "http_html",
        notes,
        blockers,
        records,
        rawHtml: JSON.stringify(rawPayload, null, 2),
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
