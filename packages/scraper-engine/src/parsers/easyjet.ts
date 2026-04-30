import { absoluteUrl, canonicalUrl, normalizeText, uniqueBy } from "../core/normalizers";
import type { LivePriceRecord } from "../core/types";
import { parsePromotionAnchors } from "./common";

const easyJetHolidayBaseUrl = "https://www.easyjet.com/en/holidays";
const easyJetOrigin = "https://www.easyjet.com";

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

export function parseEasyJetPackageSearchLivePrices(
  payloadText: string,
  sourceUrl: string,
  collectedAt: string,
) {
  const payload = parseJsonObject(payloadText);
  const offers = Array.isArray(payload?.offers) ? payload.offers : [];
  const records = offers
    .map((offer) => parseEasyJetPackageOffer(offer, sourceUrl, collectedAt))
    .filter((record): record is LivePriceRecord => Boolean(record));

  return uniqueBy(
    records,
    (record) => `${record.propertyName}|${record.travelDate}|${record.nights}|${record.priceText}|${record.sourceUrl}`,
  );
}

function parseEasyJetPackageOffer(
  value: unknown,
  sourceUrl: string,
  collectedAt: string,
): LivePriceRecord | null {
  const offer = asRecord(value);
  const hotel = asRecord(offer?.hotel);
  const accom = asRecord(offer?.accom);
  const firstUnit = firstRecord(accom?.unit);
  const propertyName = normalizeText(readString(hotel, "name"));

  if (!propertyName) return null;

  const price = readNumber(offer, "pricePP") ?? readNumber(firstUnit, "pricePP") ?? readNumber(offer, "price");
  const travelDate = normalizeDate(readString(offer, "date") ?? readString(accom, "date"));
  const stay = readNumber(offer, "stay") ?? readNumber(accom, "stay");
  const boardBasis =
    readNestedString(firstUnit, "boardType", "title") ??
    readString(firstUnit, "board") ??
    readNestedString(accom, "boardType", "title");
  const currency =
    normalizeText(readString(offer, "currency")) ||
    normalizeText(readNestedString(firstUnit, "currency", "code")) ||
    "GBP";
  const productUrl = buildEasyJetProductUrl(readString(hotel, "url"), offer, accom, firstUnit) ?? sourceUrl;
  const imageUrl = readEasyJetImageUrl(hotel);

  return {
    kind: "live-price",
    competitor: "easyjet-holidays",
    propertyName,
    destination: buildDestination(hotel),
    travelDate,
    nights: stay === null ? null : `${stay} nights`,
    boardBasis: normalizeText(boardBasis) || null,
    priceText: formatPrice(price, currency),
    currency,
    sourceUrl: productUrl,
    imageUrl,
    collectedAt,
    evidence: {
      sourceUrl,
      finalUrl: sourceUrl,
      rawHtmlPath: null,
      screenshotPath: null,
      selector: "offers[]",
    },
  };
}

function readEasyJetImageUrl(hotel: Record<string, unknown> | null) {
  const image = firstRecord(hotel?.images);
  const url = readString(image, "large") ?? readString(image, "medium") ?? readString(image, "small");

  return canonicalUrl(url, easyJetOrigin) ?? absoluteUrl(url, easyJetOrigin);
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

function readNestedString(record: Record<string, unknown> | null, key: string, nestedKey: string) {
  return readString(asRecord(record?.[key]), nestedKey);
}

function readNamedObject(record: Record<string, unknown> | null, key: string) {
  return normalizeText(readNestedString(record, key, "name") ?? readNestedString(record, key, "itemName"));
}

function normalizeDate(value: string | null) {
  if (!value) return null;

  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeText(value) || null;

  return date.toISOString().slice(0, 10);
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

function buildDestination(hotel: Record<string, unknown> | null) {
  const parts = [
    readNamedObject(hotel, "location"),
    readNamedObject(hotel, "resort"),
    readNamedObject(hotel, "country"),
  ].filter(Boolean);

  return parts.length > 0 ? [...new Set(parts)].join(", ") : null;
}

function buildEasyJetProductUrl(
  hotelPath: string | null,
  offer: Record<string, unknown> | null,
  accom: Record<string, unknown> | null,
  unit: Record<string, unknown> | null,
) {
  const path = normalizeText(hotelPath);
  const fallback = absoluteUrl(path, `${easyJetHolidayBaseUrl}/`);

  if (!path && !fallback) return null;

  try {
    const url =
      path.startsWith("http://") || path.startsWith("https://")
        ? new URL(path)
        : path.startsWith("/en/holidays/")
          ? new URL(path, easyJetOrigin)
          : path.startsWith("/")
            ? new URL(`/en/holidays${path}`, easyJetOrigin)
            : new URL(path, `${easyJetHolidayBaseUrl}/`);
    const packageId = readString(accom, "packageId") ?? readString(unit, "packageId");
    const accommodationId = readString(accom, "id") ?? readString(accom, "code");
    const departureDate = normalizeDate(readString(offer, "date") ?? readString(accom, "date"));
    const duration = readNumber(offer, "stay") ?? readNumber(accom, "stay");

    if (packageId) url.searchParams.set("packageId", packageId);
    if (accommodationId) url.searchParams.set("accommodationId", accommodationId);
    if (departureDate) url.searchParams.set("departureDate", departureDate);
    if (duration !== null) url.searchParams.set("duration", String(duration));

    return canonicalUrl(url.toString()) ?? url.toString();
  } catch {
    return fallback;
  }
}
