import { makeLivePriceResult, makePromotionResult } from "@/lib/probes/result";
import { settlePage, tryAcceptCookies } from "@/lib/probes/browser";
import { createLivePriceSamplesFromDom, createPromotionSamplesFromAnchors } from "@/lib/probes/utils";
import type { CompetitorProbeModule } from "@/lib/probes";
import { COMPETITORS } from "@/lib/probes/types";

const competitor = COMPETITORS.find((entry) => entry.slug === "tui")!;
const homeUrl = "https://www.tui.co.uk/";
const dealsUrl =
  "https://www.tui.co.uk/destinations/deals/summer-handpicked-deals?vlid=T%7CL1%7CB1%7CAV%7CNA%7CNA%7CNO%7CNO%7CNO%7CBAU%7C546";

export const tuiProbe: CompetitorProbeModule = {
  competitor,
  async promotions(context) {
    const notes = [
      "Direct server-side HTML fetches returned Akamai blocking earlier, so this probe uses Playwright.",
      "The goal here is to prove browser-rendered access, not hidden API reverse engineering.",
    ];

    try {
      const page = await context.getPage();
      await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await tryAcceptCookies(page);
      await settlePage(page, 2_500);
      await page.goto(dealsUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await settlePage(page);

      const screenshotPath = await context.captureScreenshot(page, "promotions");
      const html = await page.content();
      const samples = createPromotionSamplesFromAnchors(
        html,
        dealsUrl,
        (href, text) =>
          href.includes("/destinations/deals/") &&
          text.length > 6 &&
          !/view all/i.test(text),
      );

      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: dealsUrl,
        method: "browser_html",
        samples,
        notes,
        blockers:
          samples.length === 0
            ? ["TUI rendered in the browser, but no stable deal-card extraction was found on the chosen page."]
            : [],
        screenshotPath,
        htmlSnippet: html,
      });
    } catch (error) {
      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: dealsUrl,
        method: "browser_html",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "TUI promotions probe failed."],
        forceFailed: true,
      });
    }
  },
  async livePrices(context) {
    const notes = [
      "TUI is treated as browser-required in this lab because direct HTML fetches are Akamai-protected.",
      "This spike uses rendered deal/list pages as a live-price proxy rather than a full search-form submission.",
    ];

    try {
      const page = await context.getPage();
      await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await tryAcceptCookies(page);
      await settlePage(page, 2_500);
      await page.goto(dealsUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await settlePage(page);

      const screenshotPath = await context.captureScreenshot(page, "live_prices");
      const html = await page.content();
      const samples = createLivePriceSamplesFromDom(html, dealsUrl);

      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl: dealsUrl,
        method: "browser_html",
        samples,
        notes,
        blockers:
          samples.length === 0
            ? ["TUI rendered successfully, but this spike did not extract three stable live-price cards yet."]
            : [],
        screenshotPath,
        htmlSnippet: html,
      });
    } catch (error) {
      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl: dealsUrl,
        method: "browser_html",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "TUI live price probe failed."],
        forceFailed: true,
      });
    }
  },
};
