import { load } from "cheerio";

import { absoluteUrl, canonicalUrl, extractDiscount, normalizeText, uniqueBy } from "../core/normalizers";
import type { LivePriceRecord, PromotionRecord } from "../core/types";

const easyJetHolidayBaseUrl = "https://www.easyjet.com/en/holidays";
const easyJetOrigin = "https://www.easyjet.com";
const easyJetDealsUrl = "https://www.easyjet.com/en/holidays/deals";

export function parseEasyJetPromotions(html: string, collectedAt: string) {
  return parseEasyJetDealsMarketing(html, easyJetDealsUrl, collectedAt);
}

export function parseEasyJetDealsMarketing(html: string, sourceUrl: string, collectedAt: string) {
  const $ = load(html);
  const records: PromotionRecord[] = [];

  $("#main-content .promo-merch-banner, main .promo-merch-banner").each((_, element) => {
    const card = $(element);
    const title = readCleanText(card.find(".promo-merch-banner__title").first());
    const subtitle = readCleanText(card.find(".promo-merch-banner__description").first());
    const primaryLink = card.find("a.promo-merch-banner__btn[href]").first();
    const href = primaryLink.attr("href");
    const recordUrl = canonicalUrl(href, easyJetOrigin) ?? absoluteUrl(href, easyJetOrigin);

    if (!title || !recordUrl) return;

    const terms = readCleanText(card.find(".promo-merch-banner__terms").first());
    const promoCode = normalizeText(card.find(".promo-code").first().text()) || readEasyJetPromoCode(card.text());
    const text = [title, subtitle, terms].filter(Boolean).join(" ");
    const discountText = readEasyJetDiscountText(text);

    records.push({
      kind: "promotion",
      competitor: "easyjet-holidays",
      title,
      subtitle,
      priceText: null,
      discountText,
      destinationText: null,
      sourceUrl: recordUrl,
      imageUrl: readEasyJetMarketingImageUrl(card.find("img").first().attr("src")),
      offerType: classifyEasyJetMarketingOffer(title, subtitle, promoCode),
      promoCode,
      validityText: terms,
      collectedAt,
      evidence: {
        sourceUrl: recordUrl,
        finalUrl: sourceUrl,
        rawHtmlPath: null,
        screenshotPath: null,
        selector: ".promo-merch-banner",
      },
    });
  });

  return uniqueBy(records, (record) => `${record.title}|${record.sourceUrl}`);
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

interface TextSelection {
  clone(): {
    find(selector: string): { remove(): void };
    text(): string;
  };
}

function readCleanText(selection: TextSelection) {
  const clone = selection.clone();
  clone.find("style,script,svg,button").remove();

  return normalizeText(clone.text()) || null;
}

function readEasyJetPromoCode(text: string) {
  const match = normalizeText(text).match(/use code:\s*([A-Z0-9]+)/i);

  return normalizeText(match?.[1]) || null;
}

function readEasyJetDiscountText(text: string) {
  const normalized = normalizeText(text);
  const discount = extractDiscount(normalized);

  if (discount) return discount;

  const priceLimit =
    normalized.match(/(?:all\s+)?£\s?\d[\d,]*pp\s+or\s+less/i)?.[0] ??
    normalized.match(/\ball\s+under\s+£\s?\d[\d,]*pp/i)?.[0] ??
    normalized.match(/\bunder\s+£\s?\d[\d,]*pp/i)?.[0];

  if (priceLimit) return normalizeText(priceLimit);

  const freeChildPlaces = normalized.match(/\bfree child places?\b/i)?.[0];
  return freeChildPlaces ? normalizeText(freeChildPlaces) : null;
}

function readEasyJetMarketingImageUrl(value: string | null | undefined) {
  const imageUrl = canonicalUrl(value, easyJetOrigin) ?? absoluteUrl(value, easyJetOrigin);

  if (!imageUrl) return null;

  try {
    const parsed = new URL(imageUrl);
    const source = parsed.pathname.includes("/_next/image") ? parsed.searchParams.get("url") : null;

    return canonicalUrl(source, easyJetOrigin) ?? imageUrl;
  } catch {
    return imageUrl;
  }
}

function classifyEasyJetMarketingOffer(title: string, subtitle: string | null, promoCode: string | null) {
  const text = `${title} ${subtitle ?? ""}`.toLowerCase();

  if (promoCode) return "promo-code";
  if (text.includes("free child")) return "free-child-place";
  if (text.includes("last minute")) return "last-minute";
  if (text.includes("city")) return "city-break";
  if (text.includes("beach")) return "beach-deal";
  if (text.includes("deals of the week")) return "deals-of-the-week";
  if (text.includes("under £") || text.includes("or less")) return "budget-deal";

  return "deal-page-offer";
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
