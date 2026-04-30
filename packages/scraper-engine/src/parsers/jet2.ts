import { load } from "cheerio";

import {
  absoluteUrl,
  canonicalUrl,
  extractDiscount,
  formatUkDate,
  normalizeText,
  truncate,
  uniqueBy,
} from "../core/normalizers";
import type { LivePriceRecord, PromotionRecord } from "../core/types";
import { parseLivePriceAnchors, parseLivePriceJsonLd } from "./common";

const jet2Origin = "https://www.jet2holidays.com";
const jet2DealsUrl = "https://www.jet2holidays.com/deals";
const jet2PromotionsUrl = "https://www.jet2holidays.com/promotions";
const defaultBoardNames = new Map<number, string>([
  [1, "Bed and Breakfast"],
  [2, "Half Board"],
  [3, "Full Board"],
  [4, "Self Catering"],
  [5, "All Inclusive"],
  [6, "Room Only"],
]);

export function parseJet2Promotions(html: string, collectedAt: string) {
  return uniqueBy(
    [
      ...parseJet2DealsMarketing(html, jet2DealsUrl, collectedAt),
      ...parseJet2CurrentOfferTerms(html, jet2PromotionsUrl, collectedAt),
    ],
    (record) => `${record.title}|${record.sourceUrl}`,
  );
}

export function parseJet2DealsMarketing(html: string, sourceUrl: string, collectedAt: string) {
  const $ = load(html);
  const records: PromotionRecord[] = [];

  $(".information-bar").each((_, element) => {
    const bar = $(element);
    const title = readCleanText(bar.find("h4").first()) || readCleanText(bar);

    if (!title || title.includes("{{")) return;

    records.push(buildJet2PromotionRecord({
      title,
      subtitle: null,
      sourceUrl,
      finalUrl: sourceUrl,
      imageUrl: null,
      text: title,
      offerType: "sitewide-promo-code",
      validityText: readJet2ValidityText(title),
      selector: ".information-bar",
      collectedAt,
    }));
  });

  $(".media-block__container").each((_, element) => {
    const card = $(element);
    const mediaBlock = card.closest(".media-block");
    const title = readCleanText(card.find(".media-block__heading").first());
    const subtitle = readCleanText(card.find(".media-block__content").first());
    const href = card.find(".media-block__button[href]").first().attr("href");
    const recordUrl = canonicalUrl(href, jet2Origin) ?? absoluteUrl(href, jet2Origin) ?? sourceUrl;

    if (!title || title.includes("{{")) return;

    records.push(buildJet2PromotionRecord({
      title,
      subtitle,
      sourceUrl: recordUrl,
      finalUrl: sourceUrl,
      imageUrl: readJet2MarketingImageUrl(mediaBlock.length > 0 ? mediaBlock : card),
      text: `${title} ${subtitle ?? ""}`,
      offerType: classifyJet2MarketingOffer(title, subtitle),
      validityText: null,
      selector: ".media-block__container",
      collectedAt,
    }));
  });

  $(".ksps .ksp-block").each((_, element) => {
    const card = $(element);
    const title = readCleanText(card.find(".ksp-block__text--big").first());
    const subtitle = readCleanText(card.find(".ksp-block__text--small").first());
    const href = card.find(".ksp-block__button[href]").first().attr("href");
    const recordUrl = canonicalUrl(href, jet2Origin) ?? absoluteUrl(href, jet2Origin) ?? sourceUrl;

    if (!title || title.includes("{{")) return;

    records.push(buildJet2PromotionRecord({
      title,
      subtitle,
      sourceUrl: recordUrl,
      finalUrl: sourceUrl,
      imageUrl: null,
      text: `${title} ${subtitle ?? ""}`,
      offerType: classifyJet2MarketingOffer(title, subtitle),
      validityText: null,
      selector: ".ksps .ksp-block",
      collectedAt,
    }));
  });

  $(".info-card.info-card--with-link").each((_, element) => {
    const card = $(element);
    const title = readCleanText(card.find(".info-card__title").first());
    const subtitle = readCleanText(card.find(".info-card__text").first());
    const href =
      card
        .find("a[href]")
        .filter((__, anchor) => /read more/i.test(readCleanText($(anchor)) ?? ""))
        .first()
        .attr("href") ?? card.find("a[href]").first().attr("href");
    const recordUrl = canonicalUrl(href, jet2Origin) ?? absoluteUrl(href, jet2Origin) ?? sourceUrl;

    if (!title || title.includes("{{")) return;

    records.push(buildJet2PromotionRecord({
      title,
      subtitle,
      sourceUrl: recordUrl,
      finalUrl: sourceUrl,
      imageUrl: readJet2MarketingImageUrl(card),
      text: `${title} ${subtitle ?? ""}`,
      offerType: classifyJet2MarketingOffer(title, subtitle),
      validityText: null,
      selector: ".info-card.info-card--with-link",
      collectedAt,
    }));
  });

  return uniqueBy(records, (record) => `${record.title}|${record.sourceUrl}`);
}

export function parseJet2CurrentOfferTerms(html: string, sourceUrl: string, collectedAt: string) {
  const $ = load(html);
  const heading = $("h1")
    .filter((_, element) => readCleanText($(element)) === "Offers terms and conditions - Current")
    .first();
  const accordionContainer = heading.closest(".title-and-text").parent().children(".accordion-container").first();
  const records: PromotionRecord[] = [];

  accordionContainer.find(".accordion.js-dropdown").each((_, element) => {
    const accordion = $(element);
    const title = readCleanText(accordion.find(".accordion__header").first());
    const content = readCleanText(accordion.find(".accordion__content").first());

    if (!title || title.includes("{{") || /promotion expired/i.test(`${title} ${content ?? ""}`)) return;

    const detailText = stripRepeatedTitle(content, title);
    const text = `${title} ${detailText}`;
    const anchorName = normalizeText(accordion.find("a[name]").first().attr("name"));
    const href = accordion.find("a[href]").first().attr("href");
    const recordUrl =
      canonicalUrl(href, jet2Origin) ??
      absoluteUrl(href, jet2Origin) ??
      (anchorName ? `${sourceUrl}#${encodeURIComponent(anchorName)}` : sourceUrl);

    records.push(buildJet2PromotionRecord({
      title,
      subtitle: summarizeJet2TermsContent(detailText, title),
      sourceUrl: recordUrl,
      finalUrl: sourceUrl,
      imageUrl: null,
      text,
      offerType: classifyJet2MarketingOffer(title, null),
      validityText: readJet2ValidityText(detailText || title),
      selector: ".accordion.js-dropdown",
      collectedAt,
    }));
  });

  return uniqueBy(records, (record) => `${record.title}|${record.sourceUrl}`);
}

export function parseJet2LivePrices(html: string, baseUrl: string, collectedAt: string) {
  const smartSearchRecords = parseJet2SmartSearchLivePrices(html, baseUrl, collectedAt);

  if (smartSearchRecords.length > 0) {
    return smartSearchRecords;
  }

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

interface TextSelection {
  clone(): {
    find(selector: string): { remove(): void };
    text(): string;
  };
}

interface Jet2PromotionRecordInput {
  title: string;
  subtitle: string | null;
  sourceUrl: string;
  finalUrl: string;
  imageUrl: string | null;
  text: string;
  offerType: string;
  validityText: string | null;
  selector: string;
  collectedAt: string;
}

function buildJet2PromotionRecord(input: Jet2PromotionRecordInput): PromotionRecord {
  return {
    kind: "promotion",
    competitor: "jet2-holidays",
    title: input.title,
    subtitle: input.subtitle,
    priceText: null,
    discountText: readJet2DiscountText(input.text),
    destinationText: null,
    sourceUrl: input.sourceUrl,
    imageUrl: input.imageUrl,
    offerType: input.offerType,
    promoCode: readJet2PromoCode(input.text),
    validityText: input.validityText,
    collectedAt: input.collectedAt,
    evidence: {
      sourceUrl: input.sourceUrl,
      finalUrl: input.finalUrl,
      rawHtmlPath: null,
      screenshotPath: null,
      selector: input.selector,
    },
  };
}

function readCleanText(selection: TextSelection) {
  const clone = selection.clone();
  clone.find("script,style,svg,noscript,template,button").remove();

  return normalizeText(clone.text()) || null;
}

function readJet2MarketingImageUrl(card: { find(selector: string): { first(): { attr(name: string): string | undefined } } }) {
  const src =
    card.find("img[src]").first().attr("src") ??
    card.find("[data-src]").first().attr("data-src") ??
    card.find("source[srcset]").first().attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0];

  return canonicalUrl(src, jet2Origin) ?? absoluteUrl(src, jet2Origin);
}

function readJet2DiscountText(text: string) {
  const normalized = normalizeText(text);
  const discount =
    normalized.match(/£\s?\d[\d,]*(?:pp| per person| per booking)?\s+off/i)?.[0] ??
    normalized.match(/\b\d+\s?%\s+(?:off|discount)\b/i)?.[0] ??
    normalized.match(/\bsave(?:s)?\s+(?:over\s+)?£\s?\d[\d,]*/i)?.[0] ??
    normalized.match(/\bextra hotel discounts\b/i)?.[0] ??
    normalized.match(/\bfree child places?\b/i)?.[0] ??
    normalized.match(/\blow\s+£\s?\d[\d,]*pp deposit\b/i)?.[0] ??
    extractDiscount(normalized);

  return discount ? normalizeText(discount) : null;
}

function readJet2PromoCode(text: string) {
  const normalized = normalizeText(text);
  const explicitCandidate = normalized.match(/\b(?:promo code|promotion code|code)\s*:?\s*([A-Za-z][A-Za-z0-9]{3,})\b/i)?.[1];
  const explicit =
    (explicitCandidate && explicitCandidate === explicitCandidate.toUpperCase() ? explicitCandidate : null) ??
    normalized.match(/\(([A-Z][A-Z0-9]{3,})\)/)?.[1];

  if (explicit && !/^(REF|RECEIVED|TERMS|CONDITIONS)$/i.test(explicit)) return explicit.toUpperCase();

  return null;
}

function readJet2ValidityText(text: string) {
  const normalized = normalizeText(text);
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .filter((item) =>
      /\b(valid|booked between|departures?|departing|arrivals?|travel|sale ends|until|before|by)\b/i.test(item),
    );

  return sentences.length > 0 ? truncate(sentences.slice(0, 2).join(" "), 260) : null;
}

function summarizeJet2TermsContent(content: string | null, title: string) {
  if (!content) return null;

  const withoutTitle = normalizeText(content.replace(title, ""));
  const sentence =
    withoutTitle
      .split(/(?<=[.!?])\s+/)
      .map((item) => normalizeText(item))
      .find((item) => item && !/^terms? (?:&|and) conditions/i.test(item)) ?? withoutTitle;

  return truncate(sentence, 240);
}

function stripRepeatedTitle(content: string | null, title: string) {
  let output = content ?? "";

  while (title && output.includes(title)) {
    output = output.replace(title, "");
  }

  return normalizeText(output);
}

function classifyJet2MarketingOffer(title: string, subtitle: string | null) {
  const rawText = `${title} ${subtitle ?? ""}`;
  const text = rawText.toLowerCase();
  const titleText = title.toLowerCase();

  if (titleText.includes("summer") || titleText.includes("winter")) return "seasonal-deal";
  if (titleText.includes("all inclusive")) return "all-inclusive";
  if (titleText.includes("family")) return "family-deal";
  if (titleText.includes("city")) return "city-break";
  if (text.includes("free child")) return "free-child-place";
  if (text.includes("deposit")) return "deposit";
  if (text.includes("pay monthly")) return "payment-plan";
  if (text.includes("promo") || text.includes("code") || readJet2PromoCode(rawText)) return "promo-code";
  if (text.includes("discount") || readJet2DiscountText(text)) return "discount";
  if (text.includes("single parent")) return "single-parent";
  if (text.includes("solo")) return "solo-traveller";

  return "holiday-deal";
}

export function parseJet2SmartSearchLivePrices(
  payloadText: string,
  sourceUrl: string,
  collectedAt: string,
) {
  const payload = parseJsonObject(payloadText);
  const boardNames = buildBoardNameMap(payload);
  const flights = buildFlightMap(payload);
  const records = readArrayRecords(payload?.results)
    .map((result) => parseJet2SmartSearchResult(result, boardNames, flights, sourceUrl, collectedAt))
    .filter((record): record is LivePriceRecord => Boolean(record));

  return uniqueBy(
    records,
    (record) => `${record.propertyName}|${record.travelDate}|${record.nights}|${record.boardBasis}|${record.priceText}|${record.sourceUrl}`,
  );
}

function parseJet2SmartSearchResult(
  result: Record<string, unknown>,
  boardNames: Map<number, string>,
  flights: Map<number, Record<string, unknown>>,
  sourceUrl: string,
  collectedAt: string,
): LivePriceRecord | null {
  const property = asRecord(result.property);
  const propertyName = normalizeText(readString(property, "name"));

  if (!propertyName) return null;

  const selectedBoardId = readNumber(result, "selectedBoardTypeId");
  const selectedFlightId = readNumber(result, "selectedFlightId");
  const accommodation = chooseAccommodationOption(readArrayRecords(result.accommodationOptions), selectedBoardId);
  const priceOption = choosePriceOption(readArrayRecords(accommodation?.priceOptions), selectedFlightId);

  if (!priceOption) return null;

  const optionFlightId = readNumber(priceOption, "flightId") ?? selectedFlightId;
  const flight = optionFlightId === null ? null : flights.get(optionFlightId) ?? null;
  const outbound = asRecord(flight?.outbound);
  const boardId = readNumber(accommodation, "boardId") ?? selectedBoardId;
  const duration = readNumber(result, "duration");
  const productUrl = buildJet2ProductUrl(result, priceOption, flight, boardId, duration) ?? sourceUrl;
  const price = readNumber(priceOption, "pricePerPerson") ?? readFallbackPerPersonPrice(priceOption, sourceUrl);

  return {
    kind: "live-price",
    competitor: "jet2-holidays",
    propertyName,
    destination: buildDestination(property, productUrl),
    travelDate: normalizeDate(readString(outbound, "departureDateTimeLocal")) ?? normalizeDate(readUrlParam(productUrl, "date")),
    nights: duration === null ? null : `${duration} nights`,
    boardBasis: boardId === null ? null : (boardNames.get(boardId) ?? defaultBoardNames.get(boardId) ?? null),
    priceText: formatPrice(price),
    currency: "GBP",
    sourceUrl: productUrl,
    imageUrl: readJet2ImageUrl(property),
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

function chooseAccommodationOption(options: Record<string, unknown>[], selectedBoardId: number | null) {
  if (selectedBoardId !== null) {
    const selected = options.find((option) => readNumber(option, "boardId") === selectedBoardId);
    if (selected) return selected;
  }

  return options[0] ?? null;
}

function choosePriceOption(options: Record<string, unknown>[], selectedFlightId: number | null) {
  if (selectedFlightId !== null) {
    const selected = options.find((option) => readNumber(option, "flightId") === selectedFlightId);
    if (selected) return selected;
  }

  return options
    .slice()
    .sort((left, right) => (readNumber(left, "pricePerPerson") ?? Infinity) - (readNumber(right, "pricePerPerson") ?? Infinity))[0] ?? null;
}

function buildBoardNameMap(payload: Record<string, unknown> | null) {
  const filters = asRecord(payload?.filters);
  const boardNames = new Map(defaultBoardNames);

  for (const entry of readArrayRecords(filters?.boardbasis)) {
    const id = readNumber(entry, "id");
    const name = normalizeText(readString(entry, "name"));
    if (id !== null && name) boardNames.set(id, name);
  }

  return boardNames;
}

function buildFlightMap(payload: Record<string, unknown> | null) {
  const flights = new Map<number, Record<string, unknown>>();

  for (const flight of readArrayRecords(payload?.flights)) {
    const id = readNumber(flight, "flightId");
    if (id !== null) flights.set(id, flight);
  }

  return flights;
}

function buildJet2ProductUrl(
  result: Record<string, unknown>,
  priceOption: Record<string, unknown> | null,
  flight: Record<string, unknown> | null,
  boardId: number | null,
  duration: number | null,
) {
  const rawUrl = readString(result, "url");
  const absolute = canonicalUrl(rawUrl, jet2Origin) ?? absoluteUrl(rawUrl, jet2Origin);

  if (!absolute) return null;

  try {
    const url = new URL(absolute);
    const outbound = asRecord(flight?.outbound);
    const inbound = asRecord(flight?.inbound);
    const outboundFlightId = readNumber(outbound, "flightId");
    const inboundFlightId = readNumber(inbound, "flightId");
    const departureAirportId = readNumber(outbound, "departureAirportId");
    const departureDate = normalizeDate(readString(outbound, "departureDateTimeLocal"));
    const roomIds = readNumberArray(priceOption?.roomIds);

    if (duration !== null) url.searchParams.set("duration", String(duration));
    if (departureAirportId !== null) url.searchParams.set("airport", String(departureAirportId));
    if (departureDate) url.searchParams.set("date", formatUkDate(new Date(`${departureDate}T12:00:00Z`)));
    if (boardId !== null) url.searchParams.set("board", String(boardId));
    if (outboundFlightId !== null) url.searchParams.set("oflight", String(outboundFlightId));
    if (inboundFlightId !== null) url.searchParams.set("iflight", String(inboundFlightId));
    if (roomIds.length > 0) url.searchParams.set("rooms", roomIds.join("_"));

    return canonicalUrl(url.toString()) ?? url.toString();
  } catch {
    return absolute;
  }
}

function readJet2ImageUrl(property: Record<string, unknown> | null) {
  const image = firstRecord(property?.images);
  const rawUrl = readString(image, "url");
  const imageUrl = canonicalUrl(rawUrl, jet2Origin) ?? absoluteUrl(rawUrl, jet2Origin);

  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    if (url.hostname === "media.jet2.com" && !url.search) {
      url.searchParams.set("w", "540");
      url.searchParams.set("h", "380");
      url.searchParams.set("mode", "stretch");
      url.searchParams.set("wid", "540");
      url.searchParams.set("hei", "380");
      url.searchParams.set("fit", "stretch");
    }

    return canonicalUrl(url.toString()) ?? url.toString();
  } catch {
    return imageUrl;
  }
}

function buildDestination(property: Record<string, unknown> | null, productUrl: string | null) {
  const parts = [
    normalizeText(readString(property, "resort")),
    normalizeText(readString(property, "area")),
    readCountryFromUrl(productUrl),
  ].filter((part): part is string => Boolean(part));
  const seen = new Set<string>();
  const uniqueParts = parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueParts.length > 0 ? uniqueParts.join(", ") : null;
}

function readCountryFromUrl(productUrl: string | null) {
  if (!productUrl) return null;

  try {
    const segments = new URL(productUrl).pathname.split("/").filter(Boolean);
    const countrySlug = segments[0] === "beach" || segments[0] === "villas" ? segments[1] : null;

    return countrySlug ? titleFromSlug(countrySlug) : null;
  } catch {
    return null;
  }
}

function titleFromSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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

function readArrayRecords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function firstRecord(value: unknown) {
  return readArrayRecords(value)[0] ?? null;
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

function readNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "number" ? entry : typeof entry === "string" ? Number(entry) : null))
    .filter((entry): entry is number => entry !== null && Number.isFinite(entry));
}

function readFallbackPerPersonPrice(priceOption: Record<string, unknown> | null, sourceUrl: string) {
  const totalPrice = readNumber(priceOption, "totalPrice");
  const adults = readOccupancyAdults(sourceUrl);

  if (totalPrice === null) return null;
  if (adults === null || adults <= 0) return totalPrice;

  return totalPrice / adults;
}

function readOccupancyAdults(sourceUrl: string) {
  const occupancy = readUrlParam(sourceUrl, "occupancies") ?? readUrlParam(sourceUrl, "occupancy");
  if (!occupancy) return null;

  const direct = Number(occupancy);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const roomMatch = occupancy.match(/r(\d+)/i);
  return roomMatch ? Number(roomMatch[1]) : null;
}

function readUrlParam(sourceUrl: string | null, key: string) {
  if (!sourceUrl) return null;

  try {
    return new URL(sourceUrl, jet2Origin).searchParams.get(key);
  } catch {
    return null;
  }
}

function normalizeDate(value: string | null) {
  if (!value) return null;

  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;

  const ukDate = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ukDate) return `${ukDate[3]}-${ukDate[2]}-${ukDate[1]}`;

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
