import test from "node:test";
import assert from "node:assert/strict";

import {
  parseEasyJetDealsMarketing,
  parseEasyJetPackageSearchLivePrices,
  parseEasyJetPromotions,
  parseIonianPropertySearchLivePrices,
  parseIonianPromotions,
  parseIonianSpecialOffersMarketing,
  parseJet2CurrentOfferTerms,
  parseJet2DealsMarketing,
  parseJet2Promotions,
  parseJet2SmartSearchLivePrices,
  parseLoveholidaysLivePrices,
  parseLoveholidaysPromotions,
  parseSunvilOffersMarketing,
  parseSunvilPromotions,
  parseSunvilResultsLivePrices,
  parseTuiDestinationDealsMarketing,
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
    file: ["sunvil", "offers-search.json"],
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

test("Jet2 marketing parser returns visible deal blocks and current terms only", async () => {
  const html = await readFixture("jet2", "promotions.html");
  const dealRecords = parseJet2DealsMarketing(html, "https://www.jet2holidays.com/deals", collectedAt);
  const termsRecords = parseJet2CurrentOfferTerms(html, "https://www.jet2holidays.com/promotions", collectedAt);

  assert.equal(dealRecords.length, 5);
  assert.equal(dealRecords[0].title, "£100pp off ALL holidays, plus an extra £100 off Summer 2026 holidays with code SAVEONSUMMER. T&Cs apply.");
  assert.equal(dealRecords[0].discountText, "£100pp off");
  assert.equal(dealRecords[0].promoCode, "SAVEONSUMMER");
  assert.equal(dealRecords[0].offerType, "sitewide-promo-code");
  assert.equal(dealRecords[0].evidence.selector, ".information-bar");

  const hotelDiscounts = dealRecords.find((record) => record.title === "1000s of extra hotel discounts!");
  assert.ok(hotelDiscounts);
  assert.equal(hotelDiscounts.discountText, "extra hotel discounts");
  assert.equal(hotelDiscounts.offerType, "discount");
  assert.equal(
    hotelDiscounts.imageUrl,
    "https://media.jet2.com/is/image/jet2/26-01-0022_Media_Block_590x246px",
  );

  const summer = dealRecords.find((record) => record.title === "Summer 2027");
  assert.ok(summer);
  assert.equal(summer.offerType, "seasonal-deal");
  assert.equal(summer.sourceUrl, "https://www.jet2holidays.com/next-summer");
  assert.equal(
    summer.imageUrl,
    "https://media.jet2.com/is/image/jet2/717590-skg_Talgo_beach_Sithonia_914914286_getty:Infocard-450-x-250",
  );
  assert.equal(dealRecords.some((record) => record.title.includes("{{")), false);

  assert.equal(termsRecords.length, 2);
  assert.equal(termsRecords[0].title, "Jet2holidays £120 off holidays terms and conditions - (ref: 1357)");
  assert.equal(termsRecords[0].discountText, "£120 off");
  assert.equal(termsRecords[0].promoCode, "SAVEONSUMMER");
  assert.match(termsRecords[0].validityText ?? "", /Offer only valid/);
  assert.equal(termsRecords[1].title, "25% off In-Flight Food (TREAT25) in Manage My Booking");
  assert.equal(termsRecords[1].promoCode, "TREAT25");
  assert.equal(termsRecords.some((record) => record.title.includes("Expired")), false);
  assert.equal(termsRecords.every((record) => record.evidence.selector === ".accordion.js-dropdown"), true);
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

test("easyJet deals marketing parser returns promo merch cards only", async () => {
  const html = await readFixture("easyjet", "promotions.html");
  const records = parseEasyJetDealsMarketing(html, "https://www.easyjet.com/en/holidays/deals", collectedAt);

  assert.equal(records.length, 2);
  assert.equal(records[0].title, "SAVE UP TO £400!");
  assert.equal(records[0].subtitle, "Our big orange sale is back, save on your next getaway today.");
  assert.equal(records[0].discountText, "SAVE UP TO £400");
  assert.equal(records[0].promoCode, "ORANGESALE");
  assert.equal(records[0].offerType, "promo-code");
  assert.equal(records[0].validityText, "Travel up to Oct 2027 • Sale ends 05/05/26 • T&Cs apply");
  assert.equal(records[0].sourceUrl, "https://www.easyjet.com/en/holidays/deals/promotions");
  assert.equal(
    records[0].imageUrl,
    "https://www.easyjet.com/holidays/cms/media/-/jssmedia/project/holidays/default/icons/sale-tags/price-tag_orange.jpg?mw=500&mh=500",
  );
  assert.equal(records[1].title, "GRAB YOURSELF A Cheap Last Minute Holiday");
  assert.equal(records[1].discountText, "all under £400pp");
  assert.equal(records[1].offerType, "last-minute");
  assert.equal(records[1].validityText, null);
  assert.equal(records.some((record) => record.title === "Free child places menu item"), false);
  assert.equal(records.every((record) => record.evidence.selector === ".promo-merch-banner"), true);
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

test("Ionian special-offers marketing parser returns body promotion cards only", async () => {
  const html = await readFixture("ionian", "promotions.html");
  const records = parseIonianSpecialOffersMarketing(html, collectedAt);

  assert.equal(records.length, 3);
  assert.equal(records[0].title, "Exclusive Offers on our Newest Villas");
  assert.equal(
    records[0].subtitle,
    "Be the first to stay in our newest villas and enjoy limited-time introductory savings of up to 45% off",
  );
  assert.equal(records[0].discountText, "up to 45% off");
  assert.equal(records[0].offerType, "new-property-offer");
  assert.equal(records[0].destinationText, null);
  assert.equal(
    records[0].imageUrl,
    "https://www.ionianislandholidays.com/uploads/images/transforms/_promotionLandscape/108695/Apanemia-Mare-1.webp?v=1777472671",
  );
  assert.equal(
    records[1].imageUrl,
    "https://www.ionianislandholidays.com/uploads/images/transforms/_promotionLandscape/107820/Ionian_Meganisi_Villa_Alexandra_1.webp?v=1777472671",
  );
  assert.equal(records[1].validityText, "Free cancellation up to 3 weeks prior to departure");
  assert.equal(records[2].offerType, "early-booking");
  assert.equal(records.some((record) => record.title === "Late Availability"), false);
  assert.equal(records.every((record) => record.evidence.selector === "main article.Promotion"), true);
});

test("Sunvil offers marketing parser returns endpoint offer cards", async () => {
  const json = await readFixture("sunvil", "offers-search.json");
  const records = parseSunvilOffersMarketing(json, "https://www.sunvil.co.uk/offers/search", collectedAt);

  assert.equal(records.length, 2);
  assert.equal(records[0].title, "Kalami Bay");
  assert.equal(records[0].priceText, "£549.00");
  assert.equal(records[0].discountText, "Save up to £888.00 per person");
  assert.equal(records[0].destinationText, "Greece, Corfu, North & North East Corfu");
  assert.equal(records[0].offerType, "discounted-property-offer");
  assert.equal(records[0].validityText, "Departing between May 18th 2026 & Oct 26th 2026");
  assert.equal(
    records[0].imageUrl,
    "https://www.sunvil.co.uk/DynamicImage.ashx?image=kalami_600_360.jpg",
  );
  assert.equal(records[0].sourceUrl, "https://www.sunvil.co.uk/booking/holiday/kalami-bay");
  assert.match(records[0].subtitle ?? "", /Self Catering/);
  assert.match(records[0].subtitle ?? "", /Departing from LGW/);
  assert.equal(records[1].title, "Absalon Hotel");
  assert.equal(records[1].discountText, null);
  assert.equal(records[1].offerType, "property-offer");
  assert.equal(records[1].sourceUrl, "https://www.sunvil.co.uk/booking/holiday/absalon-hotel");
  assert.equal(records.every((record) => record.evidence.selector === ".offer.result.bg-white"), true);
});

test("TUI destination deals marketing parser returns page component offers only", async () => {
  const html = await readFixture("tui", "promotions.html");
  const records = parseTuiDestinationDealsMarketing(html, "https://www.tui.co.uk/holidays/destination-deals", collectedAt);

  assert.equal(records.length, 10);
  assert.equal(records[0].title, "Make it the Canaries this winter");
  assert.equal(records[0].subtitle, "Head to Tenerife, Lanzarote or Gran Canaria for sunshine when you need it most.");
  assert.equal(records[0].offerType, "hero-destination-deal");
  assert.equal(records[0].sourceUrl, "https://www.tui.co.uk/destinations/deals/winter-canary-island-deals");
  assert.equal(records[0].imageUrl, "https://content.tui.co.uk/adamtui/canaries.jpg");

  const cyprus = records.find((record) => record.title === "Cyprus deals");
  assert.ok(cyprus);
  assert.equal(cyprus.subtitle, "Choose from lively beach resorts or traditional mountain villages.");
  assert.equal(cyprus.priceText, "Prices from £358");
  assert.equal(cyprus.destinationText, "Cyprus");
  assert.equal(cyprus.offerType, "destination-deal");
  assert.equal(cyprus.evidence.selector, ".cards--article .card.article-card");

  const beach = records.find((record) => record.title === "Beach holidays");
  assert.ok(beach);
  assert.equal(beach.offerType, "holiday-type-deal");
  assert.equal(beach.priceText, null);

  const haul = records.find((record) => record.title === "Short-haul deals");
  assert.ok(haul);
  assert.equal(haul.subtitle, "View more deals by haul");
  assert.equal(haul.offerType, "haul-deal");

  const lapland = records.find((record) => record.title === "Lapland holidays");
  assert.ok(lapland);
  assert.equal(lapland.offerType, "trip-deal");
  assert.equal(lapland.priceText, "Prices from £644");

  const budget = records.find((record) => record.title === "Under £300pp");
  assert.ok(budget);
  assert.equal(budget.priceText, "Under £300pp");
  assert.equal(budget.offerType, "budget-deal");
  assert.equal(records.some((record) => record.title.includes("Hidden duplicate")), false);
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
