import { makeLivePriceResult, makePromotionResult } from "@/lib/probes/result";
import {
  createLivePriceSamplesFromDom,
  createPromotionSamplesFromAnchors,
  fetchHtml,
  normalizeText,
} from "@/lib/probes/utils";
import type { CompetitorProbeModule } from "@/lib/probes";
import { COMPETITORS } from "@/lib/probes/types";
import { settlePage, tryAcceptCookies } from "@/lib/probes/browser";

const competitor = COMPETITORS.find((entry) => entry.slug === "easyjet-holidays")!;
const promotionsUrl = "https://www.easyjet.com/en/holidays/deals/summer-holidays";
const livePriceFallbackUrl = "https://www.easyjet.com/en/holidays/deals/last-minute-holidays";

export const easyJetHolidaysProbe: CompetitorProbeModule = {
  competitor,
  async promotions(context) {
    const notes = [
      "Used a public easyJet Holidays category page to validate HTTP HTML promo extraction.",
    ];

    try {
      const { html } = await fetchHtml(promotionsUrl);
      const samples = createPromotionSamplesFromAnchors(
        html,
        promotionsUrl,
        (href, text) =>
          href.includes("/en/holidays/") &&
          text.length > 5 &&
          !/view all/i.test(text) &&
          !/get help/i.test(text),
      );

      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: promotionsUrl,
        method: "http_html",
        samples,
        notes,
        blockers:
          samples.length === 0
            ? ["easyJet Holidays rendered, but no stable promotion cards were extracted over HTTP."]
            : [],
        htmlSnippet: html,
      });
    } catch (error) {
      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: promotionsUrl,
        method: "http_html",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "easyJet promotions probe failed."],
        forceFailed: true,
      });
    }
  },
  async livePrices(context) {
    const notes = [
      "Opened the site in a browser context because the holiday experience is heavily client-rendered.",
      "Used a rendered deal page fallback rather than a full search-form automation path for the spike.",
    ];

    try {
      const page = await context.getPage();
      await page.goto("https://www.easyjet.com/en/holidays", {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await tryAcceptCookies(page);
      await settlePage(page);
      await page.goto(livePriceFallbackUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await settlePage(page);

      const screenshotPath = await context.captureScreenshot(page, "live_prices");
      const html = await page.content();
      const samples = createLivePriceSamplesFromDom(
        html,
        livePriceFallbackUrl,
        (href, text) =>
          href.includes("/en/holidays/") &&
          !href.includes("/deals/") &&
          normalizeText(text).length > 3,
      );

      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl: livePriceFallbackUrl,
        method: "browser_html",
        samples,
        notes,
        blockers:
          samples.length === 0
            ? [
                "Rendered easyJet Holidays pages were reachable, but this spike did not lock onto stable hotel-price cards yet.",
              ]
            : [],
        screenshotPath,
        htmlSnippet: html,
      });
    } catch (error) {
      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl: livePriceFallbackUrl,
        method: "browser_html",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "easyJet live price probe failed."],
        forceFailed: true,
      });
    }
  },
};
