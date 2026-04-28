import { makeLivePriceResult, makePromotionResult } from "@/lib/probes/result";
import {
  createLivePriceSamplesFromDom,
  createLivePriceSamplesFromJsonLd,
  createPromotionSamplesFromAnchors,
  fetchHtml,
} from "@/lib/probes/utils";
import type { CompetitorProbeModule } from "@/lib/probes";
import { COMPETITORS } from "@/lib/probes/types";

const competitor = COMPETITORS.find((entry) => entry.slug === "jet2-holidays")!;
const promotionsUrl = "https://www.jet2holidays.com/deals";
const livePriceUrl =
  "https://www.jet2holidays.com/search/results?airport=4_98_8_118_63_9_69_1_77_7_127_99_3_5&date=27-04-2026&duration=7&occupancy=r2c3_4&destination=8_43&flexi=3&sortorder=1&page=1";

export const jet2HolidaysProbe: CompetitorProbeModule = {
  competitor,
  async promotions(context) {
    const notes = [
      "Used Jet2holidays deal landing page as the promotion source.",
      "Treat jet2.com as marketing/navigation only; the actual holiday inventory sits on jet2holidays.com.",
    ];

    try {
      const { html } = await fetchHtml(promotionsUrl);
      const samples = createPromotionSamplesFromAnchors(
        html,
        promotionsUrl,
        (href, text) =>
          href.includes("/deals") &&
          !href.includes("deals-of-the-week") &&
          text.length > 6 &&
          !/view all/i.test(text),
      );

      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: promotionsUrl,
        method: "http_html",
        samples,
        notes,
        blockers: samples.length === 0 ? ["No deal tiles were parsed from the Jet2 Holidays deals page."] : [],
        htmlSnippet: html,
      });
    } catch (error) {
      return makePromotionResult({
        competitor: context.competitor.slug,
        sourceUrl: promotionsUrl,
        method: "http_html",
        samples: [],
        blockers: [error instanceof Error ? error.message : "Jet2 promotions probe failed."],
        notes,
        forceFailed: true,
      });
    }
  },
  async livePrices(context) {
    const notes = [
      "Started with a known working Jet2 Holidays search results URL to prove HTTP HTML extraction.",
      "This proves the list page is accessible without browser automation in this environment.",
    ];

    try {
      const { html } = await fetchHtml(livePriceUrl);
      const samples =
        createLivePriceSamplesFromJsonLd(html).length > 0
          ? createLivePriceSamplesFromJsonLd(html)
          : createLivePriceSamplesFromDom(html, livePriceUrl);

      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl: livePriceUrl,
        method: "http_html",
        samples,
        notes,
        blockers:
          samples.length === 0
            ? ["Search results loaded, but no stable hotel/price cards were extracted from the HTML."]
            : [],
        htmlSnippet: html,
      });
    } catch (error) {
      return makeLivePriceResult({
        competitor: context.competitor.slug,
        sourceUrl: livePriceUrl,
        method: "http_html",
        samples: [],
        notes,
        blockers: [error instanceof Error ? error.message : "Jet2 live price probe failed."],
        forceFailed: true,
      });
    }
  },
};
