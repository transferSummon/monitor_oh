import { load } from "cheerio";

import {
  absoluteUrl,
  canonicalUrl,
  extractBoardBasis,
  extractCurrency,
  extractDate,
  extractDiscount,
  extractNights,
  extractPrice,
  normalizeText,
  uniqueBy,
} from "../core/normalizers";
import type { LivePriceRecord, PromotionRecord } from "../core/types";

interface PromotionParserOptions {
  competitor: PromotionRecord["competitor"];
  baseUrl: string;
  collectedAt: string;
  linkFilter: (href: string, text: string) => boolean;
  selectorHint?: string;
  max?: number;
}

interface LivePriceParserOptions {
  competitor: LivePriceRecord["competitor"];
  baseUrl: string;
  collectedAt: string;
  linkFilter?: (href: string, text: string) => boolean;
  selectorHint?: string;
  max?: number;
}

export function parsePromotionAnchors(html: string, options: PromotionParserOptions) {
  const $ = load(html);

  const records = $("a[href]")
    .map((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href") ?? "";
      const anchorText = normalizeText(anchor.text());

      if (!options.linkFilter(href, anchorText)) return null;

      const container = anchor.closest("article, li, section, div");
      const containerText = normalizeText(container.text());
      const title =
        anchorText ||
        normalizeText(container.find("h1,h2,h3,h4,strong").first().text()) ||
        containerText.split(".")[0];

      if (!title || title.length < 4) return null;

      const sourceUrl = canonicalUrl(href, options.baseUrl) ?? absoluteUrl(href, options.baseUrl);

      const record: PromotionRecord = {
        kind: "promotion",
        competitor: options.competitor,
        title,
        subtitle:
          normalizeText(
            container
              .find("p,span")
              .map((__, child) => $(child).text())
              .get()
              .join(" "),
          ) || null,
        priceText: extractPrice(containerText),
        discountText: extractDiscount(containerText),
        destinationText:
          normalizeText(container.find("[class*='destination'], [class*='resort']").first().text()) || null,
        sourceUrl,
        collectedAt: options.collectedAt,
        evidence: {
          sourceUrl: sourceUrl ?? options.baseUrl,
          finalUrl: options.baseUrl,
          rawHtmlPath: null,
          screenshotPath: null,
          selector: options.selectorHint ?? "a[href]",
        },
      };

      return record;
    })
    .get()
    .filter((record): record is PromotionRecord => record !== null);

  return uniqueBy(records, (record) => `${record.title}|${record.sourceUrl}`).slice(0, options.max ?? 8);
}

export function parseLivePriceAnchors(html: string, options: LivePriceParserOptions) {
  const $ = load(html);

  const records = $("a[href]")
    .map((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href") ?? "";
      const anchorText = normalizeText(anchor.text());

      if (options.linkFilter && !options.linkFilter(href, anchorText)) return null;

      const container = anchor.closest("article, li, section, div");
      const containerText = normalizeText(container.text());
      const priceText = extractPrice(containerText);

      if (!priceText) return null;

      const propertyName =
        normalizeText(container.find("h1,h2,h3,h4,strong").first().text()) ||
        anchorText ||
        containerText.slice(0, 120);

      if (!propertyName || propertyName.length < 3) return null;

      const sourceUrl = canonicalUrl(href, options.baseUrl) ?? absoluteUrl(href, options.baseUrl);

      const record: LivePriceRecord = {
        kind: "live-price",
        competitor: options.competitor,
        propertyName,
        destination:
          normalizeText(container.find("[class*='destination'], [class*='resort']").first().text()) || null,
        travelDate: extractDate(containerText),
        nights: extractNights(containerText),
        boardBasis: extractBoardBasis(containerText),
        priceText,
        currency: extractCurrency(priceText),
        sourceUrl,
        collectedAt: options.collectedAt,
        evidence: {
          sourceUrl: sourceUrl ?? options.baseUrl,
          finalUrl: options.baseUrl,
          rawHtmlPath: null,
          screenshotPath: null,
          selector: options.selectorHint ?? "a[href]",
        },
      };

      return record;
    })
    .get()
    .filter((record): record is LivePriceRecord => record !== null);

  return uniqueBy(records, (record) => `${record.propertyName}|${record.priceText}|${record.sourceUrl}`).slice(
    0,
    options.max ?? 8,
  );
}

export function parseLivePriceJsonLd(
  html: string,
  options: Pick<LivePriceParserOptions, "competitor" | "collectedAt" | "baseUrl" | "selectorHint">,
) {
  const $ = load(html);
  const records: LivePriceRecord[] = [];

  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text();

    if (!raw) return;

    try {
      collectLivePriceJsonLd(JSON.parse(raw) as unknown, records, options);
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  });

  return uniqueBy(
    records,
    (record) => `${record.propertyName}|${record.priceText}|${record.sourceUrl}`,
  ).slice(0, 8);
}

function collectLivePriceJsonLd(
  payload: unknown,
  output: LivePriceRecord[],
  options: Pick<LivePriceParserOptions, "competitor" | "collectedAt" | "baseUrl" | "selectorHint">,
) {
  if (Array.isArray(payload)) {
    payload.forEach((entry) => collectLivePriceJsonLd(entry, output, options));
    return;
  }

  if (!payload || typeof payload !== "object") return;

  const record = payload as Record<string, unknown>;
  const offers = record.offers as Record<string, unknown> | undefined;

  if (typeof record.name === "string" && typeof record.url === "string" && offers) {
    const price = offers.price;
    const priceText = price === undefined || price === null ? null : `£${String(price)}`;
    const sourceUrl = canonicalUrl(record.url, options.baseUrl) ?? normalizeText(record.url);

    output.push({
      kind: "live-price",
      competitor: options.competitor,
      propertyName: normalizeText(record.name),
      destination: typeof record.address === "string" ? normalizeText(record.address) : null,
      travelDate: null,
      nights: null,
      boardBasis: null,
      priceText,
      currency:
        typeof offers.priceCurrency === "string" ? normalizeText(offers.priceCurrency) : extractCurrency(priceText),
      sourceUrl,
      collectedAt: options.collectedAt,
      evidence: {
        sourceUrl: sourceUrl ?? options.baseUrl,
        finalUrl: options.baseUrl,
        rawHtmlPath: null,
        screenshotPath: null,
        selector: options.selectorHint ?? "script[type='application/ld+json']",
      },
    });
  }

  Object.values(record).forEach((value) => collectLivePriceJsonLd(value, output, options));
}

export function extractFormFields(html: string, formSelector: string) {
  const $ = load(html);
  const form = $(formSelector).first();
  const fields = new URLSearchParams();

  form.find("input[name]").each((_, element) => {
    const input = $(element);
    const name = input.attr("name");

    if (!name) return;
    fields.set(name, input.attr("value") ?? "");
  });

  return fields;
}
