import { absoluteUrl, canonicalUrl, normalizeText, uniqueBy } from "../core/normalizers";
import type { LivePriceRecord } from "../core/types";
import { parsePromotionAnchors } from "./common";

const tuiOrigin = "https://www.tui.co.uk";

export function parseTuiPromotions(html: string, baseUrl: string, collectedAt: string) {
  return parsePromotionAnchors(html, {
    competitor: "tui",
    baseUrl,
    collectedAt,
    selectorHint: "a[href*='/deals']",
    linkFilter: (href, text) => (href.includes("/deals") || href.includes("/holidays")) && text.length > 5,
  });
}

export function parseTuiProductCardsLivePrices(
  payloadText: string,
  sourceUrl: string,
  collectedAt: string,
) {
  const payload = parseJsonObject(payloadText);
  const deals = extractDeals(payload);
  const dealsInfo = buildDealsInfoMap(extractDealsInfo(payload));
  const records = deals
    .map((deal) => parseTuiDeal(deal, dealsInfo, sourceUrl, collectedAt))
    .filter((record): record is LivePriceRecord => Boolean(record));

  return uniqueBy(
    records,
    (record) => `${record.propertyName}|${record.travelDate}|${record.nights}|${record.priceText}|${record.sourceUrl}`,
  );
}

function parseTuiDeal(
  deal: Record<string, unknown>,
  dealsInfo: Map<string, Record<string, unknown>>,
  sourceUrl: string,
  collectedAt: string,
): LivePriceRecord | null {
  const generalInfo = asRecord(deal.generalInfo);
  const tripDetails = asRecord(deal.tripDetails);
  const priceDetails = asRecord(deal.priceDetails);
  const propertyName = normalizeText(readString(generalInfo, "resortName"));

  if (!propertyName) return null;

  const code = readString(deal, "code");
  const info = code ? dealsInfo.get(code) ?? null : null;
  const price =
    readNumber(priceDetails, "totalPricePP") ??
    readNumber(priceDetails, "pricePP") ??
    readNumber(priceDetails, "totalPrice") ??
    readNumber(priceDetails, "price");
  const duration = readNumber(tripDetails, "duration");
  const productUrl = canonicalUrl(readString(deal, "bookingPageUrl"), tuiOrigin) ?? absoluteUrl(readString(deal, "bookingPageUrl"), tuiOrigin) ?? sourceUrl;
  const imageUrl = readTuiImageUrl(info);

  return {
    kind: "live-price",
    competitor: "tui",
    propertyName,
    destination: buildDestination(generalInfo),
    travelDate: normalizeDate(readString(tripDetails, "date") ?? readString(deal, "accomStartDate")),
    nights: duration === null ? null : `${duration} nights`,
    boardBasis: normalizeText(readString(tripDetails, "accommodationType") ?? readString(deal, "boardCode")) || null,
    priceText: formatPrice(price),
    currency: "GBP",
    sourceUrl: productUrl,
    imageUrl,
    collectedAt,
    evidence: {
      sourceUrl,
      finalUrl: sourceUrl,
      rawHtmlPath: null,
      screenshotPath: null,
      selector: "getDeals.data[]",
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

function extractDeals(payload: Record<string, unknown> | null) {
  const directDeals = payload?.deals;
  if (Array.isArray(directDeals)) {
    return directDeals.map(asRecord).filter((deal): deal is Record<string, unknown> => Boolean(deal));
  }

  const graphDeals = asRecord(asRecord(asRecord(payload?.data)?.getDeals)?.data);
  if (Array.isArray(graphDeals)) {
    return graphDeals.map(asRecord).filter((deal): deal is Record<string, unknown> => Boolean(deal));
  }

  const graphData = asRecord(asRecord(payload?.data)?.getDeals)?.data;
  if (Array.isArray(graphData)) {
    return graphData.map(asRecord).filter((deal): deal is Record<string, unknown> => Boolean(deal));
  }

  return [];
}

function extractDealsInfo(payload: Record<string, unknown> | null) {
  const directInfo = payload?.dealsInfo;
  if (Array.isArray(directInfo)) {
    return directInfo.map(asRecord).filter((info): info is Record<string, unknown> => Boolean(info));
  }

  const graphInfo = asRecord(asRecord(payload?.data)?.getDealsInfo)?.dealsInfo;
  if (Array.isArray(graphInfo)) {
    return graphInfo.map(asRecord).filter((info): info is Record<string, unknown> => Boolean(info));
  }

  return [];
}

function buildDealsInfoMap(items: Record<string, unknown>[]) {
  const output = new Map<string, Record<string, unknown>>();

  for (const item of items) {
    const code = readString(item, "code");
    if (code) output.set(code, item);
  }

  return output;
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

function normalizeDate(value: string | null) {
  if (!value) return null;

  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeText(value) || null;

  return date.toISOString().slice(0, 10);
}

function formatPrice(value: number | null) {
  if (value === null) return null;

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function buildDestination(generalInfo: Record<string, unknown> | null) {
  const parts = [
    normalizeText(readString(generalInfo, "destination")),
    normalizeText(readString(generalInfo, "resort")),
    normalizeText(readString(generalInfo, "country")),
  ].filter(Boolean);

  return parts.length > 0 ? [...new Set(parts)].join(", ") : null;
}

function readTuiImageUrl(info: Record<string, unknown> | null) {
  const sliderData = asRecord(info?.sliderData);
  const secondaryImage = firstRecord(sliderData?.secondaryImagesDetails);
  const url = readString(sliderData, "mainImageUrl") ?? readString(secondaryImage, "url");

  return canonicalUrl(url, tuiOrigin) ?? absoluteUrl(url, tuiOrigin);
}

function firstRecord(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.map(asRecord).find((entry): entry is Record<string, unknown> => Boolean(entry)) ?? null;
}
