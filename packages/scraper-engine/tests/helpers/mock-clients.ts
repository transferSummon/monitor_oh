import { promises as fs } from "node:fs";
import path from "node:path";

import { load } from "cheerio";

import type {
  BrowserDocument,
  BrowserPool,
  CompetitorSlug,
  HttpClient,
  HttpRequestOptions,
  HttpResponseData,
} from "../../src/core/types";

export interface FixtureResponse {
  html: string;
  status?: number;
  finalUrl?: string;
}

export async function readFixture(...segments: string[]) {
  const filePath = path.join(process.cwd(), "tests", "fixtures", ...segments);
  return fs.readFile(filePath, "utf8");
}

export class FixtureHttpClient implements HttpClient {
  constructor(
    private readonly fixtures: {
      get?: Record<string, FixtureResponse>;
      post?: Record<string, FixtureResponse>;
    },
  ) {}

  async get(url: string, _options?: HttpRequestOptions): Promise<HttpResponseData> {
    const response = this.fixtures.get?.[url];

    if (!response) {
      throw new Error(`Missing GET fixture for ${url}`);
    }

    return {
      url,
      finalUrl: response.finalUrl ?? url,
      status: response.status ?? 200,
      html: response.html,
      headers: {},
    };
  }

  async postForm(
    url: string,
    _form: URLSearchParams | Record<string, string>,
    _options?: HttpRequestOptions,
  ): Promise<HttpResponseData> {
    const response = this.fixtures.post?.[url];

    if (!response) {
      throw new Error(`Missing POST fixture for ${url}`);
    }

    return {
      url,
      finalUrl: response.finalUrl ?? url,
      status: response.status ?? 200,
      html: response.html,
      headers: {},
    };
  }
}

class FixtureBrowserDocument implements BrowserDocument {
  private currentUrlValue: string;

  constructor(private readonly fixtures: Record<string, FixtureResponse>, initialUrl: string) {
    this.currentUrlValue = initialUrl;
  }

  async goto(url: string) {
    if (!this.fixtures[url]) {
      throw new Error(`Missing browser fixture for ${url}`);
    }

    this.currentUrlValue = url;
  }

  async acceptCookies() {
    return;
  }

  async content() {
    return this.fixtures[this.currentUrlValue].html;
  }

  async currentUrl() {
    return this.fixtures[this.currentUrlValue].finalUrl ?? this.currentUrlValue;
  }

  async takeScreenshot() {
    return Buffer.from(`fixture-screenshot:${this.currentUrlValue}`);
  }

  async collectHrefs(selector: string) {
    const $ = load(this.fixtures[this.currentUrlValue].html);
    return $(selector)
      .map((_, element) => $(element).attr("href"))
      .get()
      .filter((href): href is string => Boolean(href));
  }

  async click(_selector: string) {
    return false;
  }

  async fill(_selector: string, _value: string) {
    return false;
  }

  async selectOption(_selector: string, _value: string) {
    return false;
  }

  rawPage() {
    return null;
  }
}

export class FixtureBrowserPool implements BrowserPool {
  constructor(
    private readonly fixtures: Record<string, FixtureResponse>,
    private readonly initialUrl: string,
  ) {}

  async getDocument(_competitor: CompetitorSlug) {
    return new FixtureBrowserDocument(this.fixtures, this.initialUrl);
  }

  async close() {
    return;
  }
}
