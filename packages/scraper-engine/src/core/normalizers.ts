export const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "accept-language": "en-GB,en;q=0.9",
};

const TRACKING_PARAMS = new Set(["fbclid", "gclid"]);

export async function gentleDelay(ms = 850) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function truncate(value: string | null | undefined, max = 400) {
  const normalized = normalizeText(value);

  if (!normalized) return null;
  if (normalized.length <= max) return normalized;
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

export function canonicalUrl(input: string | null | undefined, baseUrl?: string) {
  const value = normalizeText(input);

  if (!value) return null;

  try {
    const url = new URL(value, baseUrl);
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function formatUkDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
}

export function extractPrice(text: string) {
  const match =
    text.match(/£\s?\d[\d,]*(?:\.\d{2})?(?:\s?(?:pp|per person))?/i) ??
    text.match(/\bfrom\s+£\s?\d[\d,]*/i);

  return match ? normalizeText(match[0]) : null;
}

export function extractDiscount(text: string) {
  const match =
    text.match(/save up to\s+£?\d[\d,]*/i) ??
    text.match(/save\s+£\d[\d,]*/i) ??
    text.match(/up to\s+\d+\s?% off/i) ??
    text.match(/\b\d+\s?%\s?off\b/i);

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

export function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    const key = getKey(item);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(item);
  }

  return output;
}
