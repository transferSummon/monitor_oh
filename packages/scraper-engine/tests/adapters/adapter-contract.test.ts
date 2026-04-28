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
        "https://www.jet2holidays.com/search/results?airport=4_98_8_118_63_9_69_1_77_7_127_99_3_5&date=22-05-2026&duration=7&occupancy=r2&destination=8_43&flexi=3&sortorder=1&page=1":
          {
            html: await readFixture("jet2", "live-prices.html"),
            finalUrl: "https://www.jet2holidays.com/search/results",
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
    http: async () => ({ get: {} }),
    browser: async () => ({
      initialUrl: "https://www.easyjet.com/en/holidays",
      fixtures: {
        "https://www.easyjet.com/en/holidays": {
          html: "<html><body><h1>easyJet holidays</h1></body></html>",
        },
        "https://www.easyjet.com/en/holidays/deals/summer-holidays": {
          html: await readFixture("easyjet", "live-prices.html"),
        },
        "https://www.easyjet.com/en/holidays/deals/last-minute-holidays": {
          html: await readFixture("easyjet", "live-prices.html"),
        },
      },
    }),
  },
  {
    name: "TUI promotions",
    competitor: "tui",
    capability: "promotions",
    http: async () => ({ get: {} }),
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
    http: async () => ({ get: {} }),
    browser: async () => ({
      initialUrl:
        "https://www.tui.co.uk/destinations/deals/summer-handpicked-deals?vlid=T%7CL1%7CB1%7CAV%7CNA%7CNA%7CNO%7CNO%7CNO%7CBAU%7C546",
      fixtures: {
        "https://www.tui.co.uk/destinations/deals/summer-handpicked-deals?vlid=T%7CL1%7CB1%7CAV%7CNA%7CNA%7CNO%7CNO%7CNO%7CBAU%7C546":
          {
            html: await readFixture("tui", "live-prices.html"),
          },
      },
    }),
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
      },
      post: {
        "https://www.sunvil.co.uk/results/discover": {
          html: await readFixture("sunvil", "live-prices.html"),
          finalUrl: "https://www.sunvil.co.uk/results/discover",
        },
      },
    }),
    browser: async () => ({
      fixtures: {
        "https://www.sunvil.co.uk/offers": {
          html: await readFixture("sunvil", "live-prices.html"),
        },
      },
      initialUrl: "https://www.sunvil.co.uk/offers",
    }),
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
            html: await readFixture("ionian", "live-prices.html"),
            finalUrl: "https://www.ionianislandholidays.com/search/properties",
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
