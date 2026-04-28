import { makeLivePriceResult, makePromotionResult } from "@/lib/probes/result";
import { settlePage, tryAcceptCookies } from "@/lib/probes/browser";
import {
  createLivePriceSamplesFromDom,
  createPromotionSamplesFromAnchors,
  fetchHtml,
} from "@/lib/probes/utils";
import type { CompetitorProbeModule } from "@/lib/probes";
import { COMPETITORS } from "@/lib/probes/types";

const competitor = COMPETITORS.find((entry) => entry.slug === "sunvil")!;
const offersUrl = "https://www.sunvil.co.uk/offers";
const discoverUrl = "https://www.sunvil.co.uk/results/discover";

export const sunvilProbe: CompetitorProbeModule = {
  competitor,
  async promotions(context) {
    const notes = [
      "Started on the published /offers page, then fall back to browser rendering if the HTTP page remains empty.",
    ];

    try {
      const { html } = await fetchHtml(offersUrl);
      let samples = createPromotionSamplesFromAnchors(
        html,
        offersUrl,
        (href, text) => href.includes("/offers/") && text.length > 5,
      );
      let method: "http_html" | "browser_html" = "http_html";
      let screenshotPath: string | null = null;
      let htmlSnippet = html;

      if (samples.length === 0 || /no offers available/i.test(html)) {
        const page = await context.getPage();
        await page.goto(offersUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await tryAcceptCookies(page);
        await settlePage(page);
        screenshotPath = await context.captureScreenshot(page, "promotions");
        htmlSnippet = await page.content();
        samples = createPromotionSamplesFromAnchors(
          htmlSnippet,
          offersUrl,
          (href, text) => href.includes("/offers/") && text.length > 5,
        );
        method = "browser_html";
        notes.push("The static HTML did not expose populated offers, so the probe switched to browser rendering.");
      }

      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: offersUrl,
        method,
        samples,
        notes,
        blockers:
          samples.length === 0 ? ["Sunvil offers rendered, but no promotion entries were parsed."] : [],
        screenshotPath,
        htmlSnippet,
      });
    } catch (error) {
      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: offersUrl,
        method: "http_html",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "Sunvil promotions probe failed."],
        forceFailed: true,
      });
    }
  },
  async livePrices(context) {
    const notes = [
      "This probe first attempts Sunvil's posted results flow, then falls back to browser submission if needed.",
    ];

    const blockers: string[] = [];

    try {
      const response = await fetch(discoverUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          DiscoverAdults: "2",
          DiscoverChildren: "0",
          DiscoverInfants: "0",
          DiscoverPassengers: "2 Adults",
        }),
      });
      const html = await response.text();
      let samples = createLivePriceSamplesFromDom(html, discoverUrl);

      if (samples.length > 0) {
        notes.push("Sunvil returned result HTML directly from the posted discover form.");
        return makeLivePriceResult({
          competitor: context.competitor.slug,
          sourceUrl: discoverUrl,
          method: "http_form",
          samples,
          notes,
          htmlSnippet: html,
        });
      }

      blockers.push("Direct HTML form post did not return usable result cards.");

      const page = await context.getPage();
      await page.goto(offersUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await tryAcceptCookies(page);
      await settlePage(page);
      const screenshotPath = await context.captureScreenshot(page, "live_prices");
      const browserHtml = await page.content();
      samples = createLivePriceSamplesFromDom(browserHtml, offersUrl);

      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl: offersUrl,
        method: "browser_form",
        samples,
        notes: [
          ...notes,
          "Browser fallback used the rendered results/offers experience rather than an internal endpoint.",
        ],
        blockers:
          samples.length === 0
            ? [...blockers, "Browser fallback did not expose stable price cards in the spike."]
            : blockers,
        screenshotPath,
        htmlSnippet: browserHtml,
      });
    } catch (error) {
      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl: discoverUrl,
        method: "http_form",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "Sunvil live price probe failed."],
        forceFailed: true,
      });
    }
  },
};
