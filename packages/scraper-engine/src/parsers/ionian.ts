import { parseLivePriceAnchors, parsePromotionAnchors } from "./common";

export function parseIonianPromotions(html: string, collectedAt: string) {
  return parsePromotionAnchors(html, {
    competitor: "ionian-island-holidays",
    baseUrl: "https://www.ionianislandholidays.com/special-offers",
    collectedAt,
    selectorHint: "a[href*='/special-offers/']",
    linkFilter: (href, text) =>
      href.includes("/special-offers/") && !href.endsWith("/special-offers") && text.length > 4,
  });
}

export function parseIonianLivePrices(html: string, baseUrl: string, collectedAt: string) {
  return parseLivePriceAnchors(html, {
    competitor: "ionian-island-holidays",
    baseUrl,
    collectedAt,
    selectorHint: "a[href]",
  });
}
