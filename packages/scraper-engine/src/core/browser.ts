import pLimit from "p-limit";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { DEFAULT_HEADERS } from "./normalizers";
import type { BrowserDocument, BrowserPool, CompetitorSlug } from "./types";

class PlaywrightDocument implements BrowserDocument {
  constructor(private readonly page: Page) {}

  async goto(url: string, options: { timeoutMs?: number; waitMs?: number } = {}) {
    await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs ?? 45_000,
    });
    await this.page.waitForTimeout(options.waitMs ?? 3_000);
  }

  async acceptCookies() {
    const candidates = [/accept/i, /allow all/i, /accept all/i, /agree/i, /continue/i];

    for (const candidate of candidates) {
      const button = this.page.getByRole("button", { name: candidate }).first();

      try {
        if (await button.isVisible({ timeout: 1_250 })) {
          await button.click({ timeout: 1_250 });
          await this.page.waitForTimeout(1_000);
          return;
        }
      } catch {
        // Ignore missing cookie banners.
      }
    }
  }

  async content() {
    return this.page.content();
  }

  async currentUrl() {
    return this.page.url();
  }

  async takeScreenshot() {
    return this.page.screenshot({ fullPage: true });
  }

  async collectHrefs(selector: string) {
    return this.page.locator(selector).evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("href"))
        .filter((href): href is string => Boolean(href)),
    );
  }

  async click(selector: string) {
    const locator = this.page.locator(selector).first();

    try {
      if (await locator.isVisible({ timeout: 1_500 })) {
        await locator.click({ timeout: 2_000 });
        await this.page.waitForTimeout(1_000);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  async fill(selector: string, value: string) {
    const locator = this.page.locator(selector).first();

    try {
      if (await locator.isVisible({ timeout: 1_500 })) {
        await locator.fill(value, { timeout: 2_000 });
        await this.page.waitForTimeout(500);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  async selectOption(selector: string, value: string) {
    const locator = this.page.locator(selector).first();

    try {
      if (await locator.isVisible({ timeout: 1_500 })) {
        await locator.selectOption(value, { timeout: 2_000 });
        await this.page.waitForTimeout(500);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  rawPage() {
    return this.page;
  }
}

export class PlaywrightBrowserPool implements BrowserPool {
  private readonly limit = pLimit(1);
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async getDocument(_competitor: CompetitorSlug) {
    return this.limit(async () => {
      if (!this.browser) {
        this.browser = await chromium.launch({ headless: true });
      }

      if (!this.context) {
        this.context = await this.browser.newContext({
          locale: "en-GB",
          timezoneId: "Europe/London",
          userAgent: DEFAULT_HEADERS["user-agent"],
          viewport: { width: 1440, height: 1200 },
        });
        await this.context.setExtraHTTPHeaders({
          "accept-language": DEFAULT_HEADERS["accept-language"],
        });
      }

      if (!this.page) {
        this.page = await this.context.newPage();
      }

      return new PlaywrightDocument(this.page);
    });
  }

  async close() {
    await this.page?.close().catch(() => undefined);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
