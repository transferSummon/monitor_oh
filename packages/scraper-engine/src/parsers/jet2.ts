import { parseLivePriceAnchors, parseLivePriceJsonLd, parsePromotionAnchors } from "./common";

export function parseJet2Promotions(html: string, collectedAt: string) {
  return parsePromotionAnchors(html, {
    competitor: "jet2-holidays",
    baseUrl: "https://www.jet2holidays.com/",
    collectedAt,
    selectorHint: "a[href*='/deals'], a[href*='/promotions']",
    linkFilter: (href, text) =>
      (href.includes("/deals") || href.includes("/promotions")) &&
      !/view all/i.test(text) &&
      text.length > 5,
  });
}

export function parseJet2LivePrices(html: string, baseUrl: string, collectedAt: string) {
  const jsonLd = parseLivePriceJsonLd(html, {
    competitor: "jet2-holidays",
    baseUrl,
    collectedAt,
    selectorHint: "script[type='application/ld+json']",
  });

  if (jsonLd.length > 0) {
    return jsonLd;
  }

  return parseLivePriceAnchors(html, {
    competitor: "jet2-holidays",
    baseUrl,
    collectedAt,
    selectorHint: "a[href]",
  });
}
