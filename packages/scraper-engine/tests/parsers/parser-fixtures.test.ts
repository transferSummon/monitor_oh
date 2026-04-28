import test from "node:test";
import assert from "node:assert/strict";

import {
  parseEasyJetLivePrices,
  parseEasyJetPromotions,
  parseIonianLivePrices,
  parseIonianPromotions,
  parseJet2LivePrices,
  parseJet2Promotions,
  parseLoveholidaysLivePrices,
  parseLoveholidaysPromotions,
  parseSunvilLivePrices,
  parseSunvilPromotions,
  parseTuiLivePrices,
  parseTuiPromotions,
} from "../../src/parsers";
import { readFixture } from "../helpers/mock-clients";

const collectedAt = "2026-04-22T10:00:00.000Z";

const cases = [
  {
    name: "jet2 promotions",
    file: ["jet2", "promotions.html"],
    parse: (html: string) => parseJet2Promotions(html, collectedAt),
  },
  {
    name: "jet2 live prices",
    file: ["jet2", "live-prices.html"],
    parse: (html: string) => parseJet2LivePrices(html, "https://www.jet2holidays.com/search/results", collectedAt),
  },
  {
    name: "easyJet promotions",
    file: ["easyjet", "promotions.html"],
    parse: (html: string) => parseEasyJetPromotions(html, collectedAt),
  },
  {
    name: "easyJet live prices",
    file: ["easyjet", "live-prices.html"],
    parse: (html: string) => parseEasyJetLivePrices(html, "https://www.easyjet.com/en/holidays/search", collectedAt),
  },
  {
    name: "TUI promotions",
    file: ["tui", "promotions.html"],
    parse: (html: string) => parseTuiPromotions(html, "https://www.tui.co.uk/holidays/destination-deals", collectedAt),
  },
  {
    name: "TUI live prices",
    file: ["tui", "live-prices.html"],
    parse: (html: string) => parseTuiLivePrices(html, "https://www.tui.co.uk/destinations/deals/summer", collectedAt),
  },
  {
    name: "Sunvil promotions",
    file: ["sunvil", "promotions.html"],
    parse: (html: string) => parseSunvilPromotions(html, collectedAt),
  },
  {
    name: "Sunvil live prices",
    file: ["sunvil", "live-prices.html"],
    parse: (html: string) => parseSunvilLivePrices(html, "https://www.sunvil.co.uk/results/discover", collectedAt),
  },
  {
    name: "Ionian promotions",
    file: ["ionian", "promotions.html"],
    parse: (html: string) => parseIonianPromotions(html, collectedAt),
  },
  {
    name: "Ionian live prices",
    file: ["ionian", "live-prices.html"],
    parse: (html: string) => parseIonianLivePrices(html, "https://www.ionianislandholidays.com/search/properties", collectedAt),
  },
  {
    name: "loveholidays promotions",
    file: ["loveholidays", "promotions.html"],
    parse: (html: string) => parseLoveholidaysPromotions(html, collectedAt),
  },
  {
    name: "loveholidays live prices",
    file: ["loveholidays", "live-prices.html"],
    parse: (html: string) => parseLoveholidaysLivePrices(html, "https://www.loveholidays.com/holidays/l/spain/example?masterId=111", collectedAt),
  },
] as const;

for (const entry of cases) {
  test(`fixture parser: ${entry.name}`, async () => {
    const html = await readFixture(...entry.file);
    const records = entry.parse(html);
    assert.ok(records.length >= 1);
  });
}
