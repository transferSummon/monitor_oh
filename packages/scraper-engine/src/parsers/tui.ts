import { parseLivePriceAnchors, parsePromotionAnchors } from "./common";

export function parseTuiPromotions(html: string, baseUrl: string, collectedAt: string) {
  return parsePromotionAnchors(html, {
    competitor: "tui",
    baseUrl,
    collectedAt,
    selectorHint: "a[href*='/deals']",
    linkFilter: (href, text) => (href.includes("/deals") || href.includes("/holidays")) && text.length > 5,
  });
}

export function parseTuiLivePrices(html: string, baseUrl: string, collectedAt: string) {
  return parseLivePriceAnchors(html, {
    competitor: "tui",
    baseUrl,
    collectedAt,
    selectorHint: "a[href]",
  });
}
