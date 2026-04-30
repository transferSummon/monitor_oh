import { absoluteUrl, canonicalUrl, formatUkDate, normalizeText, uniqueBy } from "../core/normalizers";
import type { LivePriceRecord } from "../core/types";
import { parseLivePriceAnchors, parseLivePriceJsonLd, parsePromotionAnchors } from "./common";

const jet2Origin = "https://www.jet2holidays.com";
const defaultBoardNames = new Map<number, string>([
  [1, "Bed and Breakfast"],
  [2, "Half Board"],
  [3, "Full Board"],
  [4, "Self Catering"],
  [5, "All Inclusive"],
  [6, "Room Only"],
]);

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
