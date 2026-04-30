import { absoluteUrl, canonicalUrl, normalizeText, uniqueBy } from "../core/normalizers";
import type { LivePriceRecord } from "../core/types";
import { parsePromotionAnchors } from "./common";

const ionianOrigin = "https://www.ionianislandholidays.com";

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
