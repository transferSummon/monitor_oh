import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { writeScreenshot } from "@/lib/probes/storage";
import { DEFAULT_HEADERS } from "@/lib/probes/utils";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function createBrowserSession(): Promise<BrowserSession> {
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    locale: "en-GB",
    timezoneId: "Europe/London",
    userAgent: DEFAULT_HEADERS["user-agent"],
    viewport: { width: 1440, height: 1200 },
  });

  await context.setExtraHTTPHeaders({
    "accept-language": DEFAULT_HEADERS["accept-language"],
  });

  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

export async function tryAcceptCookies(page: Page) {
  const candidates = [
    /accept/i,
    /allow all/i,
    /agree/i,
    /continue/i,
  ];

  for (const candidate of candidates) {
    const button = page.getByRole("button", { name: candidate }).first();
    try {
      if (await button.isVisible({ timeout: 1500 })) {
        await button.click({ timeout: 1500 });
        return;
      }
    } catch {
      // Ignore missing cookie banners.
    }
  }
}

export async function settlePage(page: Page, ms = 3_000) {
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(ms);
}

export async function captureScreenshot(
  page: Page,
  competitorSlug: string,
  probeType: string,
  runId: string,
) {
  const safeRunId = runId.replaceAll(":", "-");
  const relativePath = `screenshots/${competitorSlug}/${probeType}/${safeRunId}.png`;
  const data = await page.screenshot({ fullPage: true });
  return writeScreenshot(relativePath, data);
}
