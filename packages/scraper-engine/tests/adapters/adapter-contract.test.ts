import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ADAPTERS } from "../../src/adapters";
import { runScrape } from "../../src/core/runner";
import { LocalArtifactWriter } from "../../src/core/writer";
import { FixtureBrowserPool, FixtureHttpClient, readFixture } from "../helpers/mock-clients";

const homeUrl = "https://www.loveholidays.com/";

async function createWriter() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scraper-engine-"));
  return new LocalArtifactWriter(tmpDir);
}

const scenarios = [
  {
    name: "jet2 promotions",
    competitor: "jet2-holidays",
    capability: "promotions",
    http: async () => ({
      get: {
        "https://www.jet2holidays.com/deals": {
          html: await readFixture("jet2", "promotions.html"),
        },
        "https://www.jet2holidays.com/promotions": {
          html: await readFixture("jet2", "promotions.html"),
        },
      },
    }),
    browser: async () => ({ fixtures: {}, initialUrl: homeUrl }),
  },
  {
    name: "jet2 live prices",
    competitor: "jet2-holidays",
    capability: "live-prices",
    http: async () => ({
      get: {
        "https://www.jet2holidays.com/api/jet2/smartsearch/search?departureAirportIds=4_98_8_118_63_9_69_1_77_7_127_99_3_5&destinationAreaIds=8_43&departureDate=2026-05-22&durations=7&occupancies=2&pageNumber=1&pageSize=24&sortOrder=1&filters=&holidayTypeId=0&flexibility=7&minPrice=&includePriceBreakDown=false&brandId=&inboundFlightId=0&outboundFlightId=0&gtmSearchType=Smart+Search&searchId=&applyDiscount=true&occupancyOpen=false&useMultiSearch=false&defaultSearchParametersUsed=false&inboundFlightTimes=&outboundFlightTimes=&flexi=3":
          {
            html: await readFixture("jet2", "smart-search.json"),
            finalUrl: "https://www.jet2holidays.com/api/jet2/smartsearch/search",
          },
      },
    }),
    browser: async () => ({ fixtures: {}, initialUrl: homeUrl }),
  },
  {
    name: "easyJet promotions",
    competitor: "easyjet-holidays",
    capability: "promotions",
    http: async () => ({
      get: {
        "https://www.easyjet.com/en/holidays/deals": {
          html: await readFixture("easyjet", "promotions.html"),
        },
        "https://www.easyjet.com/en/holidays/deals/summer-holidays": {
          html: await readFixture("easyjet", "promotions.html"),
        },
        "https://www.easyjet.com/en/holidays/deals/last-minute-holidays": {
          html: await readFixture("easyjet", "promotions.html"),
        },
      },
    }),
    browser: async () => ({ fixtures: {}, initialUrl: homeUrl }),
  },
  {
    name: "easyJet live prices",
    competitor: "easyjet-holidays",
    capability: "live-prices",
    http: async () => ({
      get: {
        "https://www.easyjet.com/holidays/_api/v1.0/search/packages?startDate=2026-05-22&endDate=2026-06-21&duration=7&flexibleDays=3&departure=LGW&geography=GR&automaticAllocation=false&page=1&pageSize=12&room%5B0%5D.adults=2&room%5B0%5D.children=0&room%5B0%5D.infants=0":
          {
            html: await readFixture("easyjet", "package-search.json"),
            finalUrl: "https://www.easyjet.com/holidays/_api/v1.0/search/packages",
          },
      },
    }),
    browser: async () => ({ fixtures: {}, initialUrl: homeUrl }),
  },
  {
    name: "TUI promotions",
    competitor: "tui",
    capability: "promotions",
    http: async () => ({
      get: {
        "https://www.tui.co.uk/holidays/destination-deals": {
          html: await readFixture("tui", "promotions.html"),
        },
      },
    }),
    browser: async () => ({
      initialUrl: "https://www.tui.co.uk/holidays/destination-deals",
      fixtures: {
        "https://www.tui.co.uk/holidays/destination-deals": {
          html: await readFixture("tui", "promotions.html"),
        },
      },
    }),
  },
  {
    name: "TUI live prices",
    competitor: "tui",
    capability: "live-prices",
    http: async () => ({
      get: {},
      post: {
        "https://mwa.tui.com/browse/mwa/product-cards-production/graphql": [
          {
            html: await readFixture("tui", "product-cards-get-deals.json"),
            finalUrl: "https://mwa.tui.com/browse/mwa/product-cards-production/graphql",
          },
          {
            html: await readFixture("tui", "product-cards-get-deals-info.json"),
            finalUrl: "https://mwa.tui.com/browse/mwa/product-cards-production/graphql",
          },
        ],
      },
    }),
    browser: async () => ({ fixtures: {}, initialUrl: homeUrl }),
  },
  {
    name: "Sunvil promotions",
    competitor: "sunvil",
    capability: "promotions",
    http: async () => ({
      get: {
        "https://www.sunvil.co.uk/offers": {
          html: await readFixture("sunvil", "promotions.html"),
        },
        "https://www.sunvil.co.uk/offers/search": {
          html: await readFixture("sunvil", "offers-search.json"),
          finalUrl: "https://www.sunvil.co.uk/offers/search",
        },
      },
    }),
    browser: async () => ({ fixtures: {}, initialUrl: homeUrl }),
  },
  {
    name: "Sunvil live prices",
    competitor: "sunvil",
    capability: "live-prices",
    http: async () => ({
      get: {
        "https://www.sunvil.co.uk/offers": {
          html: await readFixture("sunvil", "promotions.html"),
        },
        "https://www.sunvil.co.uk/results/getpage?pageNumber=1&toFilter=false": {
          html: await readFixture("sunvil", "results-getpage.json"),
          finalUrl: "https://www.sunvil.co.uk/results/getpage?pageNumber=1&toFilter=false",
        },
        "https://www.sunvil.co.uk/booking/holiday/kalami-bay?CacheId=fixture-cache": {
          html: await readFixture("sunvil", "booking-kalami-bay.html"),
          finalUrl: "https://www.sunvil.co.uk/booking/holiday/kalami-bay?CacheId=fixture-cache",
        },
        "https://www.sunvil.co.uk/holiday/priceandavailability?code=49110&roomCode=49111&nights=7&boardCode=Self+Catering&departureAirport=LGW&adults=2&children=0&infants=0&departureDate=&returnDate=&roomFit=":
          {
            html: await readFixture("sunvil", "price-availability-kalami-bay.json"),
            finalUrl:
              "https://www.sunvil.co.uk/holiday/priceandavailability?code=49110&roomCode=49111&nights=7&boardCode=Self+Catering&departureAirport=LGW&adults=2&children=0&infants=0&departureDate=&returnDate=&roomFit=",
          },
      },
      post: {
        "https://www.sunvil.co.uk/results/discover": {
          html: await readFixture("sunvil", "live-prices.html"),
          finalUrl: "https://www.sunvil.co.uk/results/discover",
        },
      },
    }),
    browser: async () => ({ fixtures: {}, initialUrl: homeUrl }),
  },
  {
    name: "Ionian promotions",
    competitor: "ionian-island-holidays",
    capability: "promotions",
    http: async () => ({
      get: {
        "https://www.ionianislandholidays.com/special-offers": {
          html: await readFixture("ionian", "promotions.html"),
        },
      },
    }),
    browser: async () => ({ fixtures: {}, initialUrl: homeUrl }),
  },
  {
    name: "Ionian live prices",
    competitor: "ionian-island-holidays",
    capability: "live-prices",
    http: async () => ({
      get: {
        "https://www.ionianislandholidays.com/search/properties?duration=7&airport=none&refine=collections%3A84810%7Ctype%3AV%2CA":
          {
            html: '<html><script>var APP_GLOBALS = {"csrfToken":"fixture-token"}</script></html>',
            finalUrl:
              "https://www.ionianislandholidays.com/search/properties?duration=7&airport=none&refine=collections%3A84810%7Ctype%3AV%2CA",
          },
      },
      post: {
        "https://www.ionianislandholidays.com/actions/ionian/property/search": {
          html: await readFixture("ionian", "property-search.json"),
          finalUrl: "https://www.ionianislandholidays.com/actions/ionian/property/search",
        },
      },
    }),
    browser: async () => ({ fixtures: {}, initialUrl: homeUrl }),
  },
  {
    name: "loveholidays promotions",
    competitor: "loveholidays",
    capability: "promotions",
    http: async () => ({ get: {} }),
    browser: async () => ({
      fixtures: {
        [homeUrl]: {
          html: await readFixture("loveholidays", "promotions.html"),
        },
      },
      initialUrl: homeUrl,
    }),
  },
  {
    name: "loveholidays live prices",
    competitor: "loveholidays",
    capability: "live-prices",
    http: async () => ({ get: {} }),
    browser: async () => ({
      fixtures: {
        [homeUrl]: {
          html: await readFixture("loveholidays", "promotions.html"),
        },
        "https://www.loveholidays.com/holidays/l/spain/example?masterId=111": {
          html: await readFixture("loveholidays", "live-prices.html"),
        },
      },
      initialUrl: homeUrl,
    }),
  },
] as const;

for (const scenario of scenarios) {
  test(`adapter contract: ${scenario.name}`, async () => {
    const writer = await createWriter();
    const httpFixtures = await scenario.http();
    const browserFixtures = await scenario.browser();
    const result = await runScrape({
      competitor: scenario.competitor,
      capability: scenario.capability,
      adapters: ADAPTERS,
      writer,
      searchWindow: {
        fromDate: "2026-05-22",
        toDate: "2026-06-21",
        adults: 2,
        rooms: 1,
        nights: 7,
        timezone: "Europe/London",
      },
      httpClient: new FixtureHttpClient(httpFixtures),
      browserPool: new FixtureBrowserPool(browserFixtures.fixtures, browserFixtures.initialUrl),
    });

    assert.notEqual(result.status, "failed");
    assert.ok(result.records.length >= 1 || result.blockers.length >= 1);
    await fs.access(path.join(writer.getRootDir(), result.artifactPaths.resultJson));
  });
}
