import { load } from "cheerio";

import { absoluteUrl, canonicalUrl, extractDiscount, normalizeText, uniqueBy } from "../core/normalizers";
import type { LivePriceRecord, PromotionRecord } from "../core/types";

const ionianOrigin = "https://www.ionianislandholidays.com";
const ionianSpecialOffersUrl = "https://www.ionianislandholidays.com/special-offers";

export function parseIonianSpecialOffersMarketing(html: string, collectedAt: string) {
  const $ = load(html);
  const mainCards = $("main article.Promotion").toArray();
  const selector = mainCards.length > 0 ? "main article.Promotion" : "article.Promotion:not(.MegaMenu-promo)";
  const cards =
    mainCards.length > 0
      ? mainCards
      : $("article.Promotion")
          .filter((_, element) => !$(element).hasClass("MegaMenu-promo"))
          .toArray();
  const records = cards
    .map((element) => {
      const card = $(element);
      const anchor = card.find("a.Promotion-link[href], a[href*='/special-offers/']").first();
      const href = anchor.attr("href");
      const sourceUrl = canonicalUrl(href, ionianSpecialOffersUrl) ?? absoluteUrl(href, ionianOrigin);

      if (!sourceUrl || !sourceUrl.startsWith(`${ionianSpecialOffersUrl}/`)) return null;

      const title =
        normalizeText(card.find(".Promotion-heading").first().text()) ||
        normalizeText(card.find("h1,h2,h3,h4,strong").first().text()) ||
        normalizeText(anchor.text());
      const subtitle =
        normalizeText(card.find(".Promotion-text").first().text()) ||
        normalizeText(card.find("p").first().text()) ||
        null;

      if (!title || !subtitle) return null;

      const cardText = normalizeText(card.text());
      const image = card.find("img.Promotion-img, img").first();
      const imageUrl = canonicalUrl(image.attr("src"), ionianOrigin) ?? absoluteUrl(image.attr("src"), ionianOrigin);
      const record: PromotionRecord = {
        kind: "promotion",
        competitor: "ionian-island-holidays",
        title,
        subtitle,
        priceText: null,
        discountText: extractDiscount(cardText),
        destinationText: inferIonianDestination(title, subtitle, image.attr("alt")),
        sourceUrl,
        imageUrl,
        offerType: inferIonianOfferType(title, subtitle),
        promoCode: null,
        validityText: inferIonianValidity(title, subtitle),
        collectedAt,
        evidence: {
          sourceUrl,
          finalUrl: ionianSpecialOffersUrl,
          rawHtmlPath: null,
          screenshotPath: null,
          selector,
        },
      };

      return record;
    })
    .filter((record): record is PromotionRecord => record !== null);

  return uniqueBy(records, (record) => record.sourceUrl ?? record.title);
}

export function parseIonianPromotions(html: string, collectedAt: string) {
  return parseIonianSpecialOffersMarketing(html, collectedAt);
}

export function parseIonianPropertySearchLivePrices(
  payloadText: string,
  sourceUrl: string,
  collectedAt: string,
) {
  const payload = parseJsonObject(payloadText);
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const records = results
    .map((result) => parseIonianPropertySearchResult(result, sourceUrl, collectedAt))
    .filter((record): record is LivePriceRecord => Boolean(record));

  return uniqueBy(
    records,
    (record) => `${record.propertyName}|${record.travelDate}|${record.nights}|${record.priceText}|${record.sourceUrl}`,
  );
}

function parseIonianPropertySearchResult(
  value: unknown,
  sourceUrl: string,
  collectedAt: string,
): LivePriceRecord | null {
  const result = asRecord(value);
  const details = asRecord(result?.details);
  const propertyName = normalizeText(readString(details, "heading") ?? readString(details, "title"));

  if (!propertyName) return null;

  const currency = normalizeText(readString(result, "currency")) || "GBP";
  const price = selectSellingPrice(result);
  const travelDate = normalizeDate(readString(result, "departure_date"));
  const nights = readNumber(result, "nights");
  const source = buildIonianProductUrl(readString(details, "url"), result) ?? sourceUrl;

  return {
    kind: "live-price",
    competitor: "ionian-island-holidays",
    propertyName,
    destination: normalizeText(readString(details, "locationName") ?? readString(details, "locationArea")) || null,
    travelDate,
    nights: nights === null ? null : `${nights} nights`,
    boardBasis: null,
    priceText: formatPrice(price, currency),
    currency,
    sourceUrl: source,
    imageUrl: readIonianImageUrl(details),
    collectedAt,
    evidence: {
      sourceUrl,
      finalUrl: sourceUrl,
      rawHtmlPath: null,
      screenshotPath: null,
      selector: "results[]",
    },
  };
}

function inferIonianOfferType(title: string, subtitle: string) {
  const text = `${title} ${subtitle}`;

  if (/accommodation-only/i.test(text)) return "accommodation-only";
  if (/family/i.test(text)) return "family-sale";
  if (/newest villas|new properties/i.test(text)) return "new-property-offer";
  if (/sale|off|saving/i.test(text)) return "sale";
  if (/2027/i.test(text)) return "early-booking";

  return "marketing-offer";
}

function inferIonianValidity(title: string, subtitle: string) {
  const text = `${title} ${subtitle}`;
  const monthMatch = text.match(/\b(?:May|June|July|August|September|October)\s+2026\b/i);

  if (monthMatch) return normalizeText(monthMatch[0]);
  if (/July and August/i.test(text)) return "July and August";
  if (/3 weeks prior to departure/i.test(text)) return "Free cancellation up to 3 weeks prior to departure";
  if (/2027/i.test(text)) return "2027 holidays";

  return null;
}

function inferIonianDestination(title: string, subtitle: string, imageAlt: string | undefined) {
  const text = `${title} ${subtitle} ${imageAlt ?? ""}`;

  if (/Greece|Greek|Ionian|Aegean|Lefkada|Skiathos|Parga|Meganisi/i.test(text)) {
    return "Greece";
  }

  return null;
}

function parseJsonObject(payloadText: string) {
  try {
    return asRecord(JSON.parse(payloadText));
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstRecord(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.map(asRecord).find((entry): entry is Record<string, unknown> => Boolean(entry)) ?? null;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function readNumber(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];

  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readBoolean(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "boolean" ? value : false;
}

function normalizeDate(value: string | null) {
  if (!value) return null;

  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeText(value) || null;

  return date.toISOString().slice(0, 10);
}

function selectSellingPrice(result: Record<string, unknown> | null) {
  const discounted = readNumber(result, "pp_discount");
  const standard = readNumber(result, "pp");

  if (readBoolean(result, "has_offer") && discounted !== null && discounted > 0) {
    return discounted;
  }

  return standard ?? discounted;
}

function formatPrice(value: number | null, currency: string) {
  if (value === null) return null;

  if (currency === "GBP") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  }

  return `${currency} ${value.toLocaleString("en-GB")}`;
}

function readIonianImageUrl(details: Record<string, unknown> | null) {
  const image = firstRecord(details?.gallery);
  const url = readString(image, "src");

  return canonicalUrl(url, ionianOrigin) ?? absoluteUrl(url, ionianOrigin);
}

function buildIonianProductUrl(url: string | null, result: Record<string, unknown> | null) {
  const productUrl = canonicalUrl(url, ionianOrigin) ?? absoluteUrl(url, ionianOrigin);

  if (!productUrl) return null;

  try {
    const parsed = new URL(productUrl);
    const propertyCode = readString(result, "prop_code");
    const subPropertyCode = readString(result, "sub_prop_code");
    const departureDate = normalizeDate(readString(result, "departure_date"));
    const departureAirport = readString(result, "departure_airport");
    const nights = readNumber(result, "nights");

    if (propertyCode) parsed.searchParams.set("propertyCode", propertyCode);
    if (subPropertyCode) parsed.searchParams.set("subPropertyCode", subPropertyCode);
    if (departureDate) parsed.searchParams.set("departureDate", departureDate);
    if (departureAirport) parsed.searchParams.set("departureAirport", departureAirport);
    if (nights !== null) parsed.searchParams.set("nights", String(nights));

    return parsed.toString();
  } catch {
    return productUrl;
  }
}
