import { makeLivePriceResult, makePromotionResult } from "@/lib/probes/result";
import { settlePage, tryAcceptCookies } from "@/lib/probes/browser";
import {
  createLivePriceSamplesFromDom,
  createPromotionSamplesFromAnchors,
  fetchHtml,
} from "@/lib/probes/utils";
import type { CompetitorProbeModule } from "@/lib/probes";
import { COMPETITORS } from "@/lib/probes/types";

const competitor = COMPETITORS.find((entry) => entry.slug === "ionian-island-holidays")!;
const offersUrl = "https://www.ionianislandholidays.com/special-offers";
const searchUrl = "https://www.ionianislandholidays.com/search/properties";
const fallbackUrl = "https://www.ionianislandholidays.com/collection/apartments";

export const ionianIslandHolidaysProbe: CompetitorProbeModule = {
  competitor,
  async promotions(context) {
    const notes = [
      "Promotions are taken from the public special-offers pages, which are server-rendered and easy to parse.",
    ];

    try {
      const { html } = await fetchHtml(offersUrl);
      const samples = createPromotionSamplesFromAnchors(
        html,
        offersUrl,
        (href, text) =>
          href.includes("/special-offers/") &&
          !href.endsWith("/special-offers") &&
          text.length > 5,
      );

      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: offersUrl,
        method: "http_html",
        samples,
        notes,
        blockers:
          samples.length === 0 ? ["No special-offer cards were extracted from Ionian's HTML."] : [],
        htmlSnippet: html,
      });
    } catch (error) {
      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: offersUrl,
        method: "http_html",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "Ionian promotions probe failed."],
        forceFailed: true,
      });
    }
  },
  async livePrices(context) {
    const notes = [
      "Ionian live-price extraction is the least certain path in this lab.",
      "The probe starts on /search/properties, then falls back to a public collection page if search stays too thin.",
    ];

    try {
      const page = await context.getPage();
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await tryAcceptCookies(page);
      await settlePage(page);

      let html = await page.content();
      let sourceUrl = searchUrl;
      let samples = createLivePriceSamplesFromDom(html, sourceUrl);

      if (samples.length === 0) {
        await page.goto(fallbackUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await settlePage(page);
        html = await page.content();
        sourceUrl = fallbackUrl;
        samples = createLivePriceSamplesFromDom(html, sourceUrl);
        notes.push("Search page did not expose usable cards, so the probe fell back to a property collection page.");
      }

      const screenshotPath = await context.captureScreenshot(page, "live_prices");

      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl,
        method: "browser_html",
        samples,
        notes,
        blockers:
          samples.length === 0
            ? [
                "Ionian property pages were reachable, but this spike did not find three stable live-price entries yet.",
              ]
            : [],
        screenshotPath,
        htmlSnippet: html,
      });
    } catch (error) {
      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl: searchUrl,
        method: "browser_html",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "Ionian live price probe failed."],
        forceFailed: true,
      });
    }
  },
};
