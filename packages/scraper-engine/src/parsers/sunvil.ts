import { parseLivePriceAnchors, parsePromotionAnchors } from "./common";

export function parseSunvilPromotions(html: string, collectedAt: string) {
  return parsePromotionAnchors(html, {
    competitor: "sunvil",
    baseUrl: "https://www.sunvil.co.uk/offers",
    collectedAt,
    selectorHint: "a[href*='/offers/']",
    linkFilter: (href, text) => href.includes("/offers/") && text.length > 4,
  });
}

export function parseSunvilLivePrices(html: string, baseUrl: string, collectedAt: string) {
  return parseLivePriceAnchors(html, {
    competitor: "sunvil",
    baseUrl,
    collectedAt,
    selectorHint: "a[href]",
  });
}
