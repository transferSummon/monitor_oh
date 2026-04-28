import { classifyErrorBlocker, makeBlocker } from "../core/blockers";
import { absoluteUrl } from "../core/normalizers";
import { completeRunResult } from "../core/result";
import type { CompetitorAdapter } from "../core/types";
import { parseLoveholidaysLivePrices, parseLoveholidaysPromotions } from "../parsers";

const homeUrl = "https://www.loveholidays.com/";

export const loveholidaysAdapter: CompetitorAdapter = {
  slug: "loveholidays",
  async runPromotions(context) {
    const notes = [
      "loveholidays promotions are browser-only because direct HTTP hits a JS/captcha gate.",
    ];

    try {
      const document = await context.browserPool.getDocument(context.competitor.slug);
      await document.goto(homeUrl, { timeoutMs: 60_000, waitMs: 4_000 });
      await document.acceptCookies();
      const html = await document.content();
      const screenshot = await document.takeScreenshot();
      const blockers = [];

      if (/captcha|enable js and disable any ad blocker|captcha-delivery/i.test(html)) {
        blockers.push(makeBlocker("captcha", "loveholidays presented a JS or captcha gate."));
      }

      const records = parseLoveholidaysPromotions(html, new Date().toISOString());

      if (records.length === 0 && blockers.length === 0) {
        blockers.push(makeBlocker("empty_results", "loveholidays homepage rendered, but no promotion tiles were extracted."));
      }

      return completeRunResult(context, {
        capability: "promotions",
        method: "browser_html",
        notes,
        blockers,
        records,
        rawHtml: html,
        screenshot,
      });
    } catch (error) {
      return completeRunResult(context, {
        capability: "promotions",
        method: "browser_html",
        notes,
        blockers: [classifyErrorBlocker(error)],
        records: [],
        forceFailed: true,
      });
    }
  },
  async runLivePrices(context) {
    const notes = [
      "loveholidays live prices are browser-only and use rendered listing/detail pages.",
    ];

    try {
      const document = await context.browserPool.getDocument(context.competitor.slug);
      await document.goto(homeUrl, { timeoutMs: 60_000, waitMs: 4_000 });
      await document.acceptCookies();
      const landingHtml = await document.content();

      if (/captcha|enable js and disable any ad blocker|captcha-delivery/i.test(landingHtml)) {
        return completeRunResult(context, {
          capability: "live-prices",
          method: "browser_html",
          notes,
          blockers: [makeBlocker("captcha", "loveholidays presented a JS or captcha gate before product pages could be opened.")],
          records: [],
          rawHtml: landingHtml,
          screenshot: await document.takeScreenshot(),
        });
      }

      const hrefs = await document.collectHrefs("a[href*='/holidays/']");
      const detailUrl = hrefs
        .map((href) => absoluteUrl(href, homeUrl))
        .find((href) => Boolean(href && /\/holidays\//i.test(href))) ?? null;

      if (!detailUrl) {
        return completeRunResult(context, {
          capability: "live-prices",
          method: "browser_html",
          notes,
          blockers: [makeBlocker("empty_results", "No rendered loveholidays detail links were visible on the landing page.")],
          records: [],
          rawHtml: landingHtml,
          screenshot: await document.takeScreenshot(),
        });
      }

      await document.goto(detailUrl, { timeoutMs: 60_000, waitMs: 4_000 });
      const html = await document.content();
      const screenshot = await document.takeScreenshot();
      const records = parseLoveholidaysLivePrices(html, await document.currentUrl(), new Date().toISOString());
      const blockers = records.length === 0 ? [makeBlocker("empty_results", "loveholidays detail page opened, but no date/price entries were extracted.")] : [];

      return completeRunResult(context, {
        capability: "live-prices",
        method: "browser_html",
        notes,
        blockers,
        records,
        rawHtml: html,
        screenshot,
      });
    } catch (error) {
      return completeRunResult(context, {
        capability: "live-prices",
        method: "browser_html",
        notes,
        blockers: [classifyErrorBlocker(error)],
        records: [],
        forceFailed: true,
      });
    }
  },
};
