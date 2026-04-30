import { load } from "cheerio";

import { absoluteUrl, canonicalUrl, extractPrice, normalizeText, truncate, uniqueBy } from "../core/normalizers";
import type { LivePriceRecord, PromotionRecord } from "../core/types";

const tuiOrigin = "https://www.tui.co.uk";

export function parseTuiPromotions(html: string, baseUrl: string, collectedAt: string) {
  return parseTuiDestinationDealsMarketing(html, baseUrl, collectedAt);
}

export function parseTuiDestinationDealsMarketing(html: string, baseUrl: string, collectedAt: string) {
  const $ = load(html);
  const records: PromotionRecord[] = [];

  $(".media-banner").each((_, element) => {
    const banner = $(element);
    const title = readCleanText(banner.find(".text-box__title h1, .text-box__title h2, .text-box__title h3").first());
    const subtitle = readCleanText(banner.find(".text-box__subtitle").first());
    const href = banner.find("a.text-box__button[href], a.card__link[href], a[href]").first().attr("href");

    if (!title) return;

    records.push(buildTuiPromotionRecord({
      title,
      subtitle,
      priceText: readTuiPriceText(`${title} ${subtitle ?? ""}`),
      destinationText: inferTuiDestination(title),
      sourceUrl: readTuiSourceUrl(href, baseUrl),
      finalUrl: baseUrl,
      imageUrl: readTuiMarketingImageUrl(banner),
      offerType: "hero-destination-deal",
      selector: ".media-banner",
      collectedAt,
    }));
  });

  $(".cards--article").each((_, sectionElement) => {
    const section = $(sectionElement);
    const sectionTitle = readCleanText(section.find(".cards__title h2").first());

    section.find(".card.article-card").each((__, cardElement) => {
      const card = $(cardElement);
      const title = readCleanText(card.find(".text-box__title h3, h3").first());
      const subtitle = readCleanText(card.find(".text-box__description").first());
      const href = card.find("a.card__link[href], a[href]").first().attr("href");
      const cardText = readCleanText(card) ?? "";

      if (!title) return;

      records.push(buildTuiPromotionRecord({
        title,
        subtitle,
        priceText: readTuiPriceText(card.find(".article-card__price").first().text()) ?? readTuiPriceText(cardText),
        destinationText: inferTuiDestination(title),
        sourceUrl: readTuiSourceUrl(href, baseUrl),
        finalUrl: baseUrl,
        imageUrl: readTuiMarketingImageUrl(card),
        offerType: classifyTuiOffer(sectionTitle, title, cardText),
        selector: ".cards--article .card.article-card",
        collectedAt,
      }));
    });
  });

  $(".cards--icon .card.icon-card").each((_, element) => {
    const card = $(element);
    const title = readCleanText(card.find(".text-box__title h3, h3").first());
    const subtitle = readCleanText(card.find(".text-box__description").first());
    const href = card.find("a.card__link[href], a[href]").first().attr("href");

    if (!title) return;

    records.push(buildTuiPromotionRecord({
      title,
      subtitle,
      priceText: null,
      destinationText: null,
      sourceUrl: readTuiSourceUrl(href, baseUrl),
      finalUrl: baseUrl,
      imageUrl: readTuiMarketingImageUrl(card),
      offerType: "holiday-type-deal",
      selector: ".cards--icon .card.icon-card",
      collectedAt,
    }));
  });

  $("section.multi-product-tabs").each((_, sectionElement) => {
    const section = $(sectionElement);
    const sectionTitle = readCleanText(section.find("h2").first());

    section.find(".tabs__content").each((__, panelElement) => {
      const panel = $(panelElement);
      const title = normalizeText(panel.attr("data-tabname")) || readCleanText(panel.find("h3,h4").first());
      const href = panel.find(".button-container a[href], a.button[href]").first().attr("href");
      const subtitle = sectionTitle ? `View more ${sectionTitle.toLowerCase()}` : "View more deals";

      if (!title || !href) return;

      records.push(buildTuiPromotionRecord({
        title,
        subtitle,
        priceText: null,
        destinationText: null,
        sourceUrl: readTuiSourceUrl(href, baseUrl),
        finalUrl: baseUrl,
        imageUrl: null,
        offerType: "haul-deal",
        selector: "section.multi-product-tabs .tabs__content",
        collectedAt,
      }));
    });
  });

  $(".cards--gradient-navigation .gradient-navigation-card").each((_, element) => {
    const card = $(element);
    const title = readBudgetTitle(card.find(".text-box__title").first().text());
    const subtitle = readCleanText(card.find(".text-box__subtitle").first());
    const href = card.find("a.card__link[href], a[href]").first().attr("href");
    const cardText = `${title ?? ""} ${subtitle ?? ""}`;

    if (!title) return;

    records.push(buildTuiPromotionRecord({
      title,
      subtitle,
      priceText: readTuiPriceText(cardText),
      destinationText: null,
      sourceUrl: readTuiSourceUrl(href, baseUrl),
      finalUrl: baseUrl,
      imageUrl: readTuiMarketingImageUrl(card),
      offerType: "budget-deal",
      selector: ".cards--gradient-navigation .gradient-navigation-card",
      collectedAt,
    }));
  });

  return uniqueBy(records, (record) => `${record.title}|${record.sourceUrl}`);
}

interface TextSelection {
  clone(): {
    find(selector: string): { remove(): void };
    text(): string;
  };
}

interface ImageSelection {
  find(selector: string): { first(): { attr(name: string): string | undefined } };
}

interface TuiPromotionInput {
  title: string;
  subtitle: string | null;
  priceText: string | null;
  destinationText: string | null;
  sourceUrl: string | null;
  finalUrl: string;
  imageUrl: string | null;
  offerType: string;
  selector: string;
  collectedAt: string;
}

function buildTuiPromotionRecord(input: TuiPromotionInput): PromotionRecord {
  return {
    kind: "promotion",
    competitor: "tui",
    title: input.title,
    subtitle: input.subtitle,
    priceText: input.priceText,
    discountText: null,
    destinationText: input.destinationText,
    sourceUrl: input.sourceUrl,
    imageUrl: input.imageUrl,
    offerType: input.offerType,
    promoCode: null,
    validityText: null,
    collectedAt: input.collectedAt,
    evidence: {
      sourceUrl: input.sourceUrl ?? input.finalUrl,
      finalUrl: input.finalUrl,
      rawHtmlPath: null,
      screenshotPath: null,
      selector: input.selector,
    },
  };
}

function readCleanText(selection: TextSelection) {
  const clone = selection.clone();
  clone.find("script,style,svg,noscript,template,button,.u-hide-visually").remove();

  return normalizeText(clone.text()) || null;
}

function readTuiSourceUrl(href: string | null | undefined, baseUrl: string) {
  const url = canonicalUrl(href, tuiOrigin) ?? absoluteUrl(href, tuiOrigin) ?? canonicalUrl(href, baseUrl) ?? absoluteUrl(href, baseUrl);

  if (!url) return null;

  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("vlid");
    return parsed.toString();
  } catch {
    return url;
  }
}

function readTuiMarketingImageUrl(selection: ImageSelection) {
  const src =
    selection.find("img[src]").first().attr("src") ??
    selection.find("source[srcset]").first().attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0];

  return canonicalUrl(src, tuiOrigin) ?? absoluteUrl(src, tuiOrigin);
}

function readTuiPriceText(text: string | null | undefined) {
  const normalized = normalizeText(text);
  const price =
    normalized.match(/prices?\s+from\s+£\s?\d[\d,]*/i)?.[0] ??
    normalized.match(/under\s*£\s?\d[\d,]*\s*pp/i)?.[0] ??
    extractPrice(normalized);

  return price ? normalizeTuiPriceText(price) : null;
}

function readBudgetTitle(text: string | null | undefined) {
  const normalized = normalizeText(text);
  const match = normalized.match(/under\s*£\s?\d[\d,]*\s*pp/i)?.[0];

  return match ? normalizeTuiPriceText(match) : normalized || null;
}

function normalizeTuiPriceText(text: string) {
  return normalizeText(text)
    .replace(/^under\s*£/i, "Under £")
    .replace(/\s+pp\b/i, "pp");
}

function inferTuiDestination(title: string) {
  const cleaned = normalizeText(
    title
      .replace(/\b(?:holiday|holidays|deal|deals)\b/gi, "")
      .replace(/\bmake it the\b/gi, "")
      .replace(/\bthis (?:summer|winter)\b/gi, ""),
  );

  return cleaned || null;
}

function classifyTuiOffer(sectionTitle: string | null, title: string, text: string) {
  const section = normalizeText(sectionTitle).toLowerCase();
  const combined = `${title} ${text}`.toLowerCase();

  if (section.includes("top destinations")) return "destination-deal";
  if (section.includes("unforgettable")) return "trip-deal";
  if (combined.includes("disney") || combined.includes("universal")) return "theme-park-deal";
  if (combined.includes("lapland")) return "seasonal-deal";

  return "destination-deal";
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
