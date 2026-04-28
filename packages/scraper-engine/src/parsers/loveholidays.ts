import { load } from "cheerio";

import { canonicalUrl, extractCurrency, normalizeText } from "../core/normalizers";
import type { LivePriceRecord } from "../core/types";
import { parsePromotionAnchors } from "./common";

export function parseLoveholidaysPromotions(html: string, collectedAt: string) {
  return parsePromotionAnchors(html, {
    competitor: "loveholidays",
    baseUrl: "https://www.loveholidays.com/",
    collectedAt,
    selectorHint: "a[href*='/holidays/']",
    linkFilter: (href, text) => href.includes("/holidays/") && text.length > 4,
  });
}

export function parseLoveholidaysLivePrices(html: string, baseUrl: string, collectedAt: string) {
  const $ = load(html);
  const pageText = normalizeText($.text());
  const propertyName = normalizeText($("h1,h2,h3").first().text()) || "loveholidays detail page";
  const destination =
    normalizeText($("h1,h2,h3").first().parent().next().text()) || null;
  const sourceUrl = canonicalUrl(baseUrl) ?? baseUrl;
  const matches = [
    ...pageText.matchAll(
      /(\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+£\s?(\d[\d,]*)/gi,
    ),
  ];

  return matches.slice(0, 8).map((match) => {
    const record: LivePriceRecord = {
      kind: "live-price",
      competitor: "loveholidays",
      propertyName,
      destination,
      travelDate: normalizeText(match[1]),
      nights: "7 nights",
      boardBasis: null,
      priceText: `£${match[2]}`,
      currency: extractCurrency(`£${match[2]}`),
      sourceUrl,
      collectedAt,
      evidence: {
        sourceUrl,
        finalUrl: baseUrl,
        rawHtmlPath: null,
        screenshotPath: null,
        selector: "page-text date/price regex",
      },
    };

    return record;
  });
}
