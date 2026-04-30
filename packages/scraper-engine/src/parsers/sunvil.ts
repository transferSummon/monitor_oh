import { load } from "cheerio";

import { absoluteUrl, canonicalUrl, normalizeText, uniqueBy } from "../core/normalizers";
import type { LivePriceRecord, PromotionRecord, SearchWindow } from "../core/types";

const sunvilOrigin = "https://www.sunvil.co.uk";
const sunvilOffersUrl = "https://www.sunvil.co.uk/offers";

interface SunvilResultCard {
  propertyName: string;
  destination: string | null;
  priceText: string | null;
  savingText: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  dateRangeText: string | null;
  boardBasis: string | null;
  departureAirport: string | null;
  cacheResultId: string | null;
  features: string[];
}

export interface SunvilPriceAvailabilityRequest {
  sourceUrl: string;
  code: string;
  roomCode: string;
  roomName: string | null;
  nights: number | null;
  boardCode: string | null;
  departureAirport: string | null;
  departureAirportName: string | null;
  adults: number;
  children: number;
  infants: number;
}

export function parseSunvilPromotions(html: string, collectedAt: string) {
  return parseSunvilOffersMarketing(html, sunvilOffersUrl, collectedAt);
}

export function parseSunvilOffersMarketing(payloadText: string, sourceUrl: string, collectedAt: string) {
  const records = parseSunvilResultCards(payloadText, sourceUrl).map((card): PromotionRecord => {
    const source = stableSunvilMarketingUrl(card.sourceUrl);

    return {
      kind: "promotion",
      competitor: "sunvil",
      title: card.propertyName,
      subtitle: buildSunvilMarketingSubtitle(card),
      priceText: card.priceText,
      discountText: card.savingText,
      destinationText: card.destination,
      sourceUrl: source,
      imageUrl: card.imageUrl,
      offerType: card.savingText ? "discounted-property-offer" : "property-offer",
      promoCode: null,
      validityText: card.dateRangeText,
      collectedAt,
      evidence: {
        sourceUrl: source,
        finalUrl: sourceUrl,
        rawHtmlPath: null,
        screenshotPath: null,
        selector: ".offer.result.bg-white",
      },
    };
  });

  return uniqueBy(records, (record) => record.sourceUrl ?? record.title);
}

export function parseSunvilResultsLivePrices(
  payloadText: string,
  sourceUrl: string,
  collectedAt: string,
) {
  const payload = parseJsonObject(payloadText);
  const searchWindow = readSearchWindow(payload);
  const resultsPageText = readResultsPageText(payload, payloadText);
  const cards = parseSunvilResultCards(resultsPageText, sourceUrl);
  const cardsByUrl = new Map(cards.map((card) => [urlKey(card.sourceUrl), card]));
  const cardsBySlug = new Map(cards.map((card) => [bookingSlug(card.sourceUrl), card]));
  const records = readBookingPages(payload).flatMap((bookingPage) => {
    const bookingUrl = absoluteUrl(bookingPage.sourceUrl, sunvilOrigin) ?? sourceUrl;
    const card = cardsByUrl.get(urlKey(bookingUrl)) ?? cardsBySlug.get(bookingSlug(bookingUrl)) ?? null;

    return parseSunvilAvailabilityRecords({
      bookingPage,
      card,
      sourceUrl,
      bookingUrl,
      searchWindow,
      collectedAt,
    });
  });

  if (records.length > 0) {
    return uniqueBy(
      records,
      (record) => `${record.propertyName}|${record.travelDate}|${record.nights}|${record.priceText}|${record.sourceUrl}`,
    );
  }

  return uniqueBy(
    cards.map((card) => cardToFallbackRecord(card, sourceUrl, collectedAt)),
    (record) => `${record.propertyName}|${record.priceText}|${record.sourceUrl}`,
  );
}

export function parseSunvilLivePrices(html: string, baseUrl: string, collectedAt: string) {
  return parseSunvilResultsLivePrices(html, baseUrl, collectedAt);
}

export function extractSunvilResultsBookingUrls(payloadText: string, sourceUrl: string, max = 5) {
  return parseSunvilResultCards(payloadText, sourceUrl)
    .map((card) => card.sourceUrl)
    .filter(Boolean)
    .slice(0, max);
}

export function extractSunvilPriceAvailabilityRequest(
  html: string,
  sourceUrl: string,
): SunvilPriceAvailabilityRequest | null {
  const $ = load(html);
  const code = readWindowPaaValue(html, "code");
  const room = selectedOption($, "#room-select");

  if (!code || !room.value) return null;

  const duration = selectedOption($, "#duration-select");
  const board = selectedOption($, "#board-select");
  const airport = selectedOption($, "#departure-airport-select");

  return {
    sourceUrl,
    code,
    roomCode: room.value,
    roomName: room.label,
    nights: readNumber(duration.value),
    boardCode: board.value || board.label,
    departureAirport: airport.value,
    departureAirportName: airport.label,
    adults: readNumber($("#DiscoverAdultsHolls").attr("value")) ?? 2,
    children: readNumber($("#DiscoverChildrenHolls").attr("value")) ?? 0,
    infants: readNumber($("#DiscoverInfantsHolls").attr("value")) ?? 0,
  };
}

export function buildSunvilPriceAvailabilityUrl(request: SunvilPriceAvailabilityRequest) {
  const params = new URLSearchParams({
    code: request.code,
    roomCode: request.roomCode,
    nights: String(request.nights ?? ""),
    boardCode: request.boardCode ?? "",
    departureAirport: request.departureAirport ?? "",
    adults: String(request.adults),
    children: String(request.children),
    infants: String(request.infants),
    departureDate: "",
    returnDate: "",
    roomFit: "",
  });

  return `${sunvilOrigin}/holiday/priceandavailability?${params.toString()}`;
}

function parseSunvilResultCards(payloadText: string, sourceUrl: string) {
  const resultsHtml = readResultsHtml(payloadText);
  const $ = load(resultsHtml);
  const cards: SunvilResultCard[] = [];

  $(".result").each((_, element) => {
    const card = $(element);
    const source = canonicalUrl(card.find("a[href*='/booking/holiday/']").first().attr("href"), sunvilOrigin);
    const propertyName =
      normalizeText(card.find(".result-details h3").first().text()) ||
      normalizeText(card.find(".add-suitcase").first().attr("data-display-name"));

    if (!source || !propertyName) return;

    cards.push({
      propertyName,
      destination:
        normalizeDestination(card.find(".result-details h4").first().text()) ||
        normalizeDestination(card.find(".add-suitcase").first().attr("data-display-location")) ||
        null,
      priceText: readCardPriceText(card.find(".result-cta .price").first().text()),
      savingText: readCardSavingText(card.find(".result-cta .saving").first().text()),
      sourceUrl: source,
      imageUrl: readCardImageUrl(card),
      dateRangeText: readInfoPopupValue(card, "icon-cal"),
      boardBasis: readInfoPopupValue(card, "icon-board"),
      departureAirport: readInfoPopupValue(card, "icon-airport"),
      cacheResultId: normalizeText(card.find("input[name='cacheResultId']").first().attr("value")) || null,
      features: card
        .find(".result-details li")
        .map((_, item) => normalizeText($(item).text()))
        .get()
        .filter(Boolean)
        .slice(0, 3),
    });
  });

  return cards;
}

function parseSunvilAvailabilityRecords({
  bookingPage,
  card,
  sourceUrl,
  bookingUrl,
  searchWindow,
  collectedAt,
}: {
  bookingPage: SunvilBookingPayload;
  card: SunvilResultCard | null;
  sourceUrl: string;
  bookingUrl: string;
  searchWindow: Pick<SearchWindow, "fromDate" | "toDate"> | null;
  collectedAt: string;
}) {
  const request = extractSunvilPriceAvailabilityRequest(bookingPage.html, bookingUrl);
  const availability = parseJsonObject(bookingPage.availability);
  const propertyName = card?.propertyName ?? readBookingTitle(bookingPage.html);

  if (!propertyName || !request || !availability) return [];

  return extractAvailabilityRows(availability)
    .filter((row) => row.price !== null && dateInWindow(row.departureDate, searchWindow))
    .map((row): LivePriceRecord => {
      const recordUrl = buildSunvilRecordUrl(bookingUrl, request, row);

      return {
        kind: "live-price",
        competitor: "sunvil",
        propertyName,
        destination: card?.destination ?? readBookingDestination(bookingPage.html),
        travelDate: row.departureDate,
        nights: request.nights === null ? null : `${request.nights} nights`,
        boardBasis: normalizeText(request.boardCode ?? card?.boardBasis) || null,
        priceText: formatPrice(row.price),
        currency: "GBP",
        sourceUrl: recordUrl,
        imageUrl: card?.imageUrl ?? readBookingImageUrl(bookingPage.html),
        collectedAt,
        evidence: {
          sourceUrl,
          finalUrl: bookingPage.availabilityUrl ?? sourceUrl,
          rawHtmlPath: null,
          screenshotPath: null,
          selector: "results.getpage Html + holiday/priceandavailability results[].Results[]",
        },
      };
    });
}

function cardToFallbackRecord(card: SunvilResultCard, sourceUrl: string, collectedAt: string): LivePriceRecord {
  return {
    kind: "live-price",
    competitor: "sunvil",
    propertyName: card.propertyName,
    destination: card.destination,
    travelDate: parseFirstDateFromRange(card.dateRangeText),
    nights: null,
    boardBasis: card.boardBasis,
    priceText: card.priceText,
    currency: card.priceText?.includes("£") ? "GBP" : null,
    sourceUrl: card.sourceUrl,
    imageUrl: card.imageUrl,
    collectedAt,
    evidence: {
      sourceUrl,
      finalUrl: sourceUrl,
      rawHtmlPath: null,
      screenshotPath: null,
      selector: ".result",
    },
  };
}

function readResultsPageText(payload: Record<string, unknown> | null, fallback: string) {
  const resultsPage = payload?.resultsPage;

  if (typeof resultsPage === "string") return resultsPage;
  if (resultsPage && typeof resultsPage === "object") return JSON.stringify(resultsPage);

  return fallback;
}

function readResultsHtml(payloadText: string) {
  const payload = parseJsonObject(payloadText);
  const html = readString(payload, "Html") ?? readString(payload, "html");

  return html ?? payloadText;
}

interface SunvilBookingPayload {
  sourceUrl: string;
  html: string;
  availability: string;
  availabilityUrl: string | null;
}

function readBookingPages(payload: Record<string, unknown> | null) {
  const pages = Array.isArray(payload?.bookingPages) ? payload.bookingPages : [];

  return pages
    .map((entry) => {
      const page = asRecord(entry);
      const sourceUrl = readString(page, "sourceUrl");
      const html = readString(page, "html");
      const availability = readString(page, "availability");

      if (!sourceUrl || !html || !availability) return null;

      return {
        sourceUrl,
        html,
        availability,
        availabilityUrl: readString(page, "availabilityUrl"),
      };
    })
    .filter((page): page is SunvilBookingPayload => Boolean(page));
}

function extractAvailabilityRows(payload: Record<string, unknown>) {
  const months = Array.isArray(payload.results) ? payload.results : [];
  const rows: Array<{ departureDate: string | null; price: number | null; roomFit: string | null }> = [];

  for (const month of months) {
    const monthRecord = asRecord(month);
    const monthRows = Array.isArray(monthRecord?.Results) ? monthRecord.Results : [];

    for (const row of monthRows) {
      const rowRecord = asRecord(row);
      rows.push({
        departureDate: normalizeDate(readString(rowRecord, "DepartureDate")),
        price: readNumber(rowRecord?.FromPrice),
        roomFit: readString(rowRecord, "Rooms"),
      });
    }
  }

  return rows;
}

function buildSunvilRecordUrl(
  bookingUrl: string,
  request: SunvilPriceAvailabilityRequest,
  row: { departureDate: string | null; roomFit: string | null },
) {
  try {
    const url = new URL(bookingUrl);
    if (row.departureDate) url.searchParams.set("departureDate", row.departureDate);
    url.searchParams.set("roomCode", request.roomCode);
    if (request.nights !== null) url.searchParams.set("nights", String(request.nights));
    if (request.boardCode) url.searchParams.set("boardBasis", request.boardCode);
    if (request.departureAirport) url.searchParams.set("departureAirport", request.departureAirport);
    if (row.roomFit) url.searchParams.set("roomFit", row.roomFit);

    return canonicalUrl(url.toString()) ?? url.toString();
  } catch {
    return bookingUrl;
  }
}

function selectedOption($: ReturnType<typeof load>, selector: string) {
  const select = $(selector).first();
  let option = select.find("option[selected]").first();

  if (!option.length) {
    option = select.find("option").first();
  }

  return {
    value: normalizeText(option.attr("value")),
    label: normalizeText(option.text()),
  };
}

type CheerioSelection = ReturnType<ReturnType<typeof load>>;

function readInfoPopupValue(card: CheerioSelection, className: string) {
  let value: string | null = null;

  card.find(".info-popup li").each((index) => {
    const item = card.find(".info-popup li").eq(index);
    if (!item.find(`.${className}`).length) return;

    value = normalizeText(item.find("p").first().text()) || normalizeText(item.text()) || null;
  });

  return value;
}

function readCardPriceText(text: string) {
  const compact = normalizeText(text).replace(/\s+/g, "");
  const match = compact.match(/£\d[\d,]*(?:\.\d{2})?/);

  return match?.[0] ?? null;
}

function readCardSavingText(text: string) {
  const normalized = normalizeText(text);
  const amountMatch = normalized.match(/£\s?(\d[\d,]*(?:\.\d{2})?)/);

  if (!amountMatch) return null;

  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return normalized;
}

function readCardImageUrl(card: CheerioSelection) {
  const suitcaseImage = card.find(".add-suitcase").first().attr("data-display-image");
  const image =
    card.find(".images img[data-lazy]").first().attr("data-lazy") ??
    card.find(".images img[src]").first().attr("src") ??
    suitcaseImage;

  return canonicalUrl(image, sunvilOrigin) ?? absoluteUrl(image, sunvilOrigin);
}

function readBookingTitle(html: string) {
  const $ = load(html);

  return normalizeText($("h1").first().text()) || normalizeText($("meta[property='og:title']").attr("content")) || null;
}

function readBookingDestination(html: string) {
  const $ = load(html);

  return normalizeDestination($(".carousel h3").first().text());
}

function readBookingImageUrl(html: string) {
  const $ = load(html);
  const image =
    $("meta[property='og:image']").attr("content") ??
    $(".gallery img[data-lazy]").first().attr("data-lazy") ??
    $("img[data-lazy]").first().attr("data-lazy") ??
    $("img[src*='DynamicImage']").first().attr("src");

  return canonicalUrl(image, sunvilOrigin) ?? absoluteUrl(image, sunvilOrigin);
}

function readWindowPaaValue(html: string, key: string) {
  const match = html.match(new RegExp(`${key}:\\s*"([^"]+)"`));

  return normalizeText(match?.[1]) || null;
}

function normalizeDestination(value: string | null | undefined) {
  return normalizeText(value).replace(/\s*,\s*$/, "") || null;
}

function buildSunvilMarketingSubtitle(card: SunvilResultCard) {
  const parts = [
    card.destination,
    card.boardBasis,
    card.departureAirport ? `Departing from ${card.departureAirport}` : null,
    ...card.features,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

function stableSunvilMarketingUrl(value: string) {
  try {
    const url = new URL(value, sunvilOrigin);
    url.searchParams.delete("CacheId");

    return canonicalUrl(url.toString(), sunvilOrigin) ?? url.toString();
  } catch {
    return canonicalUrl(value, sunvilOrigin) ?? absoluteUrl(value, sunvilOrigin) ?? value;
  }
}

function parseJsonObject(payloadText: string | null | undefined) {
  if (!payloadText) return null;

  try {
    return asRecord(JSON.parse(payloadText));
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readSearchWindow(payload: Record<string, unknown> | null) {
  const searchWindow = asRecord(payload?.searchWindow);
  const fromDate = readString(searchWindow, "fromDate");
  const toDate = readString(searchWindow, "toDate");

  if (!fromDate && !toDate) return null;

  return { fromDate: fromDate ?? "", toDate: toDate ?? "" };
}

function normalizeDate(value: string | null) {
  if (!value) return null;

  const normalized = normalizeText(value).replace(/\//g, "-");
  const isoDate = normalized.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;

  const parsed = parseMonthDate(normalized);
  if (parsed) return parsed;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function dateInWindow(date: string | null, searchWindow: Pick<SearchWindow, "fromDate" | "toDate"> | null) {
  if (!date || !searchWindow) return Boolean(date);
  if (searchWindow.fromDate && date < searchWindow.fromDate) return false;
  if (searchWindow.toDate && date > searchWindow.toDate) return false;

  return true;
}

function parseFirstDateFromRange(value: string | null) {
  if (!value) return null;

  const match = value.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})\b/);
  if (!match) return null;

  return parseMonthDate(`${match[1]} ${match[2]} ${match[3]}`);
}

function parseMonthDate(value: string) {
  const match = normalizeText(value).match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})\b/);
  if (!match) return null;

  const monthIndex = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(match[1].slice(0, 3).toLowerCase());

  if (monthIndex < 0) return null;

  return `${match[3]}-${String(monthIndex + 1).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

function formatPrice(value: number | null) {
  if (value === null) return null;

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function urlKey(value: string | null | undefined) {
  return canonicalUrl(value, sunvilOrigin) ?? normalizeText(value);
}

function bookingSlug(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "", sunvilOrigin);
    const match = url.pathname.match(/\/booking\/holiday\/([^/]+)/);

    return match?.[1] ?? url.pathname;
  } catch {
    return normalizeText(value);
  }
}
