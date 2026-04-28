import { parseLivePriceAnchors, parsePromotionAnchors } from "./common";

export function parseEasyJetPromotions(html: string, collectedAt: string) {
  return parsePromotionAnchors(html, {
    competitor: "easyjet-holidays",
    baseUrl: "https://www.easyjet.com/en/holidays",
    collectedAt,
    selectorHint: "a[href*='/en/holidays/']",
    linkFilter: (href, text) =>
      href.includes("/en/holidays/") &&
      !/booking conditions|view all|get help/i.test(text) &&
      text.length > 5,
  });
}

export function parseEasyJetLivePrices(html: string, baseUrl: string, collectedAt: string) {
  return parseLivePriceAnchors(html, {
    competitor: "easyjet-holidays",
    baseUrl,
    collectedAt,
    selectorHint: "a[href*='/en/holidays/']",
    linkFilter: (href, text) =>
      href.includes("/en/holidays/") &&
      !href.includes("/deals/") &&
      text.length > 2,
  });
}
