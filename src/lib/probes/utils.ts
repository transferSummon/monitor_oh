import { load } from "cheerio";

import type {
  LivePriceSample,
  ProbeMethod,
  ProbeResult,
  ProbeStatus,
  PromotionSample,
} from "@/lib/probes/types";

export const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "accept-language": "en-GB,en;q=0.9",
};

export async function gentleDelay(ms = 850) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtml(url: string, init: RequestInit = {}) {
  await gentleDelay();
  const response = await fetch(url, {
    ...init,
    headers: {
      ...DEFAULT_HEADERS,
      ...(init.headers ?? {}),
    },
    redirect: "follow",
  });
  const html = await response.text();
  return { response, html };
}

export function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function truncate(value: string | null | undefined, max = 1200) {
  const normalized = normalizeText(value);
  if (normalized.length <= max) return normalized || null;
  return `${normalized.slice(0, max)}…`;
}

export function absoluteUrl(input: string | null | undefined, baseUrl: string) {
  const value = normalizeText(input);
  if (!value) return null;

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractPrice(text: string) {
  const match = text.match(/£\s?\d[\d,]*/i) ?? text.match(/\b\d[\d,]*\s?(?:pp|per person)\b/i);
  return match ? normalizeText(match[0]) : null;
}

export function extractDiscount(text: string) {
  const match =
    text.match(/save up to\s+£?\d[\d,]*/i) ??
    text.match(/up to\s+\d+\s?% off/i) ??
    text.match(/save\s+£\d[\d,]*/i);
  return match ? normalizeText(match[0]) : null;
}

export function extractBoardBasis(text: string) {
  const match = text.match(
    /(all inclusive|half board|full board|self catering|bed and breakfast|room only|any board basis)/i,
  );
  return match ? normalizeText(match[0]) : null;
}

export function extractNights(text: string) {
  const match = text.match(/\b\d+\s+nights?\b/i);
  return match ? normalizeText(match[0]) : null;
}

export function extractDate(text: string) {
  const match =
    text.match(/\b(?:mon|tue|wed|thu|fri|sat|sun)\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/i) ??
    text.match(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/i);
  return match ? normalizeText(match[0]) : null;
}

export function extractCurrency(priceText: string | null) {
  if (!priceText) return null;
  if (priceText.includes("£")) return "GBP";
  return null;
}

export function toTitleCase(value: string) {
  const cleaned = normalizeText(value);
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

export function finalizeStatus(sampleCount: number, blockers: string[], failed = false): ProbeStatus {
  if (failed) return "failed";
  if (sampleCount >= 3) return "success";
  if (sampleCount > 0) return "partial";
  if (blockers.length > 0) return "blocked";
  return "failed";
}

export function createPromotionSamplesFromAnchors(
  html: string,
  baseUrl: string,
  linkFilter: (href: string, text: string) => boolean,
  max = 8,
) {
  const $ = load(html);

  const samples = $("a[href]")
    .map((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href") ?? "";
      const anchorText = normalizeText(anchor.text());

      if (!linkFilter(href, anchorText)) return null;

      const container = anchor.closest("article, li, section, div");
      const containerText = normalizeText(container.text());
      const title =
        anchorText ||
        normalizeText(container.find("h1,h2,h3,h4,strong").first().text()) ||
        containerText.split(".")[0];

      if (!title || title.length < 4) return null;

      const destinationText =
        normalizeText(container.find("[class*='destination'], [class*='resort']").first().text()) ||
        null;

      const sample: PromotionSample = {
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
        destinationText,
        linkUrl: absoluteUrl(href, baseUrl),
      };

      return sample;
    })
    .get()
    .filter((sample): sample is PromotionSample => sample !== null);

  return uniqueBy(samples, (sample) => `${sample.title}|${sample.linkUrl}`).slice(0, max);
}

export function createLivePriceSamplesFromJsonLd(html: string) {
  const $ = load(html);
  const output: LivePriceSample[] = [];

  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text();
    if (!raw) return;

    try {
      const payload = JSON.parse(raw) as unknown;
      collectLivePriceJsonLd(payload, output);
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  });

  return uniqueBy(output, (sample) => `${sample.propertyName}|${sample.priceText}|${sample.linkUrl}`).slice(
    0,
    8,
  );
}

function collectLivePriceJsonLd(payload: unknown, output: LivePriceSample[]) {
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectLivePriceJsonLd(item, output));
    return;
  }

  if (!payload || typeof payload !== "object") return;

  const record = payload as Record<string, unknown>;
  const offers = record.offers as Record<string, unknown> | undefined;

  if (typeof record.name === "string" && typeof record.url === "string" && offers) {
    const price = offers.price;
    const priceText = price === undefined || price === null ? null : `£${String(price)}`;

    output.push({
      propertyName: normalizeText(record.name),
      destination: typeof record.address === "string" ? normalizeText(record.address) : null,
      travelDate: null,
      nights: null,
      boardBasis: null,
      priceText,
      currency: typeof offers.priceCurrency === "string" ? offers.priceCurrency : extractCurrency(priceText),
      linkUrl: normalizeText(record.url),
    });
  }

  Object.values(record).forEach((value) => collectLivePriceJsonLd(value, output));
}

export function createLivePriceSamplesFromDom(
  html: string,
  baseUrl: string,
  linkFilter?: (href: string, text: string) => boolean,
  max = 8,
) {
  const $ = load(html);
  const samples = $("a[href]")
    .map((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href") ?? "";
      const anchorText = normalizeText(anchor.text());

      if (linkFilter && !linkFilter(href, anchorText)) return null;

      const container = anchor.closest("article, li, section, div");
      const containerText = normalizeText(container.text());
      const priceText = extractPrice(containerText);

      if (!priceText) return null;

      const propertyName =
        normalizeText(container.find("h1,h2,h3,h4,strong").first().text()) ||
        anchorText ||
        containerText.slice(0, 120);

      if (!propertyName || propertyName.length < 3) return null;

      const sample: LivePriceSample = {
        propertyName,
        destination:
          normalizeText(container.find("[class*='destination'], [class*='resort']").first().text()) || null,
        travelDate: extractDate(containerText),
        nights: extractNights(containerText),
        boardBasis: extractBoardBasis(containerText),
        priceText,
        currency: extractCurrency(priceText),
        linkUrl: absoluteUrl(href, baseUrl),
      };

      return sample;
    })
    .get()
    .filter((sample): sample is LivePriceSample => sample !== null);

  return uniqueBy(samples, (sample) => `${sample.propertyName}|${sample.priceText}|${sample.linkUrl}`).slice(
    0,
    max,
  );
}

export function pickHtmlSnippet(html: string | null | undefined) {
  if (!html) return null;
  return truncate(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/\s+/g, " "), 1200);
}

export function browserMethodLabel(method: ProbeMethod) {
  return method.startsWith("browser") ? "Browser required" : "HTML required";
}

export function summarizeMethods(results: ProbeResult[]) {
  const browserCount = results.filter((result) => result.method.startsWith("browser")).length;
  if (browserCount === 0) return "HTML required" as const;
  if (browserCount === results.length) return "Browser required" as const;
  return "Mixed" as const;
}
