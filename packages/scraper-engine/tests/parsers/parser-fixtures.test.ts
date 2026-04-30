import test from "node:test";
import assert from "node:assert/strict";

import {
  parseEasyJetPackageSearchLivePrices,
  parseEasyJetPromotions,
  parseIonianPropertySearchLivePrices,
  parseIonianPromotions,
  parseJet2Promotions,
  parseJet2SmartSearchLivePrices,
  parseLoveholidaysLivePrices,
  parseLoveholidaysPromotions,
  parseSunvilPromotions,
  parseSunvilResultsLivePrices,
  parseTuiProductCardsLivePrices,
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
    file: ["jet2", "smart-search.json"],
    parse: (json: string) =>
      parseJet2SmartSearchLivePrices(
        json,
        "https://www.jet2holidays.com/api/jet2/smartsearch/search",
        collectedAt,
      ),
  },
  {
    name: "easyJet promotions",
    file: ["easyjet", "promotions.html"],
    parse: (html: string) => parseEasyJetPromotions(html, collectedAt),
  },
  {
    name: "easyJet live prices",
    file: ["easyjet", "package-search.json"],
    parse: (json: string) =>
      parseEasyJetPackageSearchLivePrices(
        json,
        "https://www.easyjet.com/holidays/_api/v1.0/search/packages",
        collectedAt,
      ),
  },
  {
    name: "TUI promotions",
    file: ["tui", "promotions.html"],
    parse: (html: string) => parseTuiPromotions(html, "https://www.tui.co.uk/holidays/destination-deals", collectedAt),
  },
  {
    name: "TUI live prices",
    file: ["tui", "product-cards.json"],
    parse: (json: string) =>
      parseTuiProductCardsLivePrices(
        json,
        "https://mwa.tui.com/browse/mwa/product-cards-production/graphql",
        collectedAt,
      ),
  },
  {
    name: "Sunvil promotions",
    file: ["sunvil", "promotions.html"],
    parse: (html: string) => parseSunvilPromotions(html, collectedAt),
  },
  {
    name: "Sunvil live prices",
    file: ["sunvil", "results-getpage.json"],
    parse: (json: string) =>
      parseSunvilResultsLivePrices(
        json,
        "https://www.sunvil.co.uk/results/getpage?pageNumber=1&toFilter=false",
        collectedAt,
      ),
  },
  {
    name: "Ionian promotions",
    file: ["ionian", "promotions.html"],
    parse: (html: string) => parseIonianPromotions(html, collectedAt),
  },
  {
    name: "Ionian live prices",
    file: ["ionian", "property-search.json"],
    parse: (json: string) =>
      parseIonianPropertySearchLivePrices(
        json,
        "https://www.ionianislandholidays.com/actions/ionian/property/search",
        collectedAt,
      ),
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

test("Jet2 Smart Search parser returns selected sellable package rows", async () => {
  const json = await readFixture("jet2", "smart-search.json");
  const records = parseJet2SmartSearchLivePrices(
    json,
    "https://www.jet2holidays.com/api/jet2/smartsearch/search?occupancies=2",
    collectedAt,
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].propertyName, "Agar Apartments");
  assert.equal(records[0].destination, "Gumbet, Bodrum Area, Turkey");
  assert.equal(records[0].travelDate, "2026-05-24");
  assert.equal(records[0].nights, "7 nights");
  assert.equal(records[0].boardBasis, "Self Catering");
  assert.equal(records[0].priceText, "£310");
  assert.equal(records[0].currency, "GBP");
  assert.equal(
    records[0].imageUrl,
    "https://media.jet2.com/is/image/jet2/BJV_74374_Agar_Apartments_0323_02?w=540&h=380&mode=stretch&wid=540&hei=380&fit=stretch",
  );
  assert.ok(records[0].sourceUrl?.startsWith("https://www.jet2holidays.com/beach/turkey/bodrum-area/gumbet/agar-apartments"));
  assert.equal(new URL(records[0].sourceUrl ?? "").searchParams.get("oflight"), "1324229");
  assert.equal(new URL(records[0].sourceUrl ?? "").searchParams.get("iflight"), "1324232");
});

test("easyJet package search parser returns sellable package rows", async () => {
  const json = await readFixture("easyjet", "package-search.json");
  const records = parseEasyJetPackageSearchLivePrices(
    json,
    "https://www.easyjet.com/holidays/_api/v1.0/search/packages",
    collectedAt,
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].propertyName, "Mitsis Selection Blue Domes");
  assert.equal(records[0].destination, "Kos, Kardamena, Greece");
  assert.equal(records[0].travelDate, "2026-06-18");
  assert.equal(records[0].nights, "7 nights");
  assert.equal(records[0].boardBasis, "All Inclusive");
  assert.equal(records[0].priceText, "£1,455");
  assert.equal(records[0].currency, "GBP");
  assert.equal(
    records[0].imageUrl,
    "https://ejh-web-prod-images.s3-eu-west-1.amazonaws.com/GRKG0007_Mitsis_Blue_Domes/Large/GRKG0007_03.jpg",
  );
  assert.ok(records[0].sourceUrl?.startsWith("https://www.easyjet.com/en/holidays/greece/kos/kardamena"));
  assert.equal(new URL(records[0].sourceUrl ?? "").searchParams.get("packageId"), "2325583783/2/3090/7");
});

test("Ionian property search parser returns sellable property departure rows", async () => {
  const json = await readFixture("ionian", "property-search.json");
  const records = parseIonianPropertySearchLivePrices(
    json,
    "https://www.ionianislandholidays.com/actions/ionian/property/search",
    collectedAt,
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].propertyName, "Cavos Inn");
  assert.equal(records[0].destination, "Assos, Kefalonia");
  assert.equal(records[0].travelDate, "2026-05-02");
  assert.equal(records[0].nights, "7 nights");
  assert.equal(records[0].boardBasis, null);
  assert.equal(records[0].priceText, "£459");
  assert.equal(records[0].currency, "GBP");
  assert.equal(
    records[0].imageUrl,
    "https://www.ionianislandholidays.com/uploads/properties/transforms/Cavos-Inn/_gallery/53103/No.6d.webp?v=1777472677",
  );
  assert.ok(records[0].sourceUrl?.startsWith("https://www.ionianislandholidays.com/property/cavos-inn"));
  assert.equal(new URL(records[0].sourceUrl ?? "").searchParams.get("subPropertyCode"), "GKCAV4");
});

test("TUI Product Cards parser returns sellable package rows", async () => {
  const json = await readFixture("tui", "product-cards.json");
  const records = parseTuiProductCardsLivePrices(
    json,
    "https://mwa.tui.com/browse/mwa/product-cards-production/graphql",
    collectedAt,
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].propertyName, "Lalila Blue Suites");
  assert.equal(records[0].destination, "Dalaman area, Marmaris, Turkey");
  assert.equal(records[0].travelDate, "2026-05-01");
  assert.equal(records[0].nights, "7 nights");
  assert.equal(records[0].boardBasis, "All Inclusive");
  assert.equal(records[0].priceText, "£840.76");
  assert.equal(records[0].currency, "GBP");
  assert.equal(
    records[0].imageUrl,
    "https://content.tui.co.uk/adamtui/2025_7/25_10/b59ab290-4172-4966-bb04-b32500b11caf/ACC_975733_TUR_92WebOriginalCompressed.jpg",
  );
  assert.ok(records[0].sourceUrl?.startsWith("https://www.tui.co.uk/destinations/bookaccommodation"));
  assert.equal(new URL(records[0].sourceUrl ?? "").searchParams.get("productCode"), "975733");
});

test("Sunvil results parser returns exact dated availability rows", async () => {
  const resultsPage = await readFixture("sunvil", "results-getpage.json");
  const bookingHtml = await readFixture("sunvil", "booking-kalami-bay.html");
  const availability = await readFixture("sunvil", "price-availability-kalami-bay.json");
  const records = parseSunvilResultsLivePrices(
    JSON.stringify({
      searchWindow: {
        fromDate: "2026-05-22",
        toDate: "2026-06-21",
        adults: 2,
        rooms: 1,
        nights: 7,
        timezone: "Europe/London",
      },
      resultsPage,
      bookingPages: [
        {
          sourceUrl: "https://www.sunvil.co.uk/booking/holiday/kalami-bay?CacheId=fixture-cache",
          html: bookingHtml,
          availability,
          availabilityUrl: "https://www.sunvil.co.uk/holiday/priceandavailability?code=49110",
        },
      ],
    }),
    "https://www.sunvil.co.uk/results/getpage?pageNumber=1&toFilter=false",
    collectedAt,
  );

  assert.equal(records.length, 2);
  assert.equal(records[0].propertyName, "Kalami Bay");
  assert.equal(records[0].destination, "Greece, Corfu, North & North East Corfu");
  assert.equal(records[0].travelDate, "2026-05-25");
  assert.equal(records[0].nights, "7 nights");
  assert.equal(records[0].boardBasis, "Self Catering");
  assert.equal(records[0].priceText, "£619.50");
  assert.equal(records[0].currency, "GBP");
  assert.equal(
    records[0].imageUrl,
    "https://www.sunvil.co.uk/DynamicImage.ashx?image=dfa78399fea1a2f96efd2cab4ec1bedc_600_360.jpg",
  );
  assert.ok(records[0].sourceUrl?.startsWith("https://www.sunvil.co.uk/booking/holiday/kalami-bay"));
  assert.equal(new URL(records[0].sourceUrl ?? "").searchParams.get("departureDate"), "2026-05-25");
  assert.equal(records[1].travelDate, "2026-06-01");
});
