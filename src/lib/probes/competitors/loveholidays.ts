import { load } from "cheerio";

import { makeLivePriceResult, makePromotionResult } from "@/lib/probes/result";
import { settlePage, tryAcceptCookies } from "@/lib/probes/browser";
import { createPromotionSamplesFromAnchors, extractCurrency, normalizeText } from "@/lib/probes/utils";
import type { CompetitorProbeModule } from "@/lib/probes";
import { COMPETITORS, type LivePriceSample } from "@/lib/probes/types";

const competitor = COMPETITORS.find((entry) => entry.slug === "loveholidays")!;
const homeUrl = "https://www.loveholidays.com/";

function extractLoveholidaysCalendarSamples(html: string, sourceUrl: string) {
  const $ = load(html);
  const pageText = normalizeText($.text());
  const propertyName = normalizeText($("h1,h2,h3").first().text()) || "loveholidays detail page";
  const destination =
    normalizeText($("h1,h2,h3")
      .first()
      .parent()
      .next()
      .text()) || null;

  const matches = [...pageText.matchAll(/(\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+£\s?(\d[\d,]*)/gi)];

  const samples: LivePriceSample[] = matches.slice(0, 8).map((match) => ({
    propertyName,
    destination,
    travelDate: normalizeText(match[1]),
    nights: "7 nights",
    boardBasis: null,
    priceText: `£${match[2]}`,
    currency: "GBP",
    linkUrl: sourceUrl,
  }));

  return samples;
}

export const loveholidaysProbe: CompetitorProbeModule = {
  competitor,
  async promotions(context) {
    const notes = [
      "loveholidays blocks direct server fetches here, so promotions use browser-rendered homepage cards.",
    ];

    try {
      const page = await context.getPage();
      await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await tryAcceptCookies(page);
      await settlePage(page, 4_000);

      const screenshotPath = await context.captureScreenshot(page, "promotions");
      const html = await page.content();
      const samples = createPromotionSamplesFromAnchors(
        html,
        homeUrl,
        (href, text) => href.includes("/holidays/l/") && text.length > 5,
      );

      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: homeUrl,
        method: "browser_html",
        samples,
        notes,
        blockers:
          samples.length === 0
            ? ["loveholidays rendered, but no homepage price-drop cards were extracted."]
            : [],
        screenshotPath,
        htmlSnippet: html,
      });
    } catch (error) {
      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: homeUrl,
        method: "browser_html",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "loveholidays promotions probe failed."],
        forceFailed: true,
      });
    }
  },
  async livePrices(context) {
    const notes = [
      "This probe uses a browser-only product-detail path because loveholidays is behind a JS/captcha gate for direct fetches.",
      "A successful run here proves the site is scrapeable only with browser assistance and care around anti-bot behavior.",
    ];

    try {
      const page = await context.getPage();
      await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await tryAcceptCookies(page);
      await settlePage(page, 4_000);

      const detailLinks = await page.locator("a[href*='/holidays/l/']").evaluateAll((anchors) =>
        anchors
          .map((anchor) => anchor.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      );

      const firstLink = detailLinks[0];

      if (!firstLink) {
        return makeLivePriceResult({
          competitor: context.competitor.slug,
          sourceUrl: homeUrl,
          method: "browser_html",
          samples: [],
          notes,
          blockers: ["No product-detail links were visible on the rendered loveholidays homepage."],
        });
      }

      const sourceUrl = new URL(firstLink, homeUrl).toString();
      await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await settlePage(page, 4_000);

      const screenshotPath = await context.captureScreenshot(page, "live_prices");
      const html = await page.content();
      const samples = extractLoveholidaysCalendarSamples(html, sourceUrl);

      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl,
        method: "browser_html",
        samples,
        notes,
        blockers:
          samples.length === 0
            ? ["Detail page opened, but no date/price calendar entries were parsed from the rendered HTML."]
            : [],
        screenshotPath,
        htmlSnippet: html,
      });
    } catch (error) {
      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl: homeUrl,
        method: "browser_html",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "loveholidays live price probe failed."],
        forceFailed: true,
      });
    }
  },
};
