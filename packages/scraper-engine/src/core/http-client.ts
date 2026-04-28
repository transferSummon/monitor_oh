import pLimit from "p-limit";

import { DEFAULT_HEADERS, gentleDelay, normalizeText } from "./normalizers";
import type { HttpClient, HttpRequestOptions, HttpResponseData } from "./types";

class CookieJar {
  private readonly store = new Map<string, Map<string, string>>();

  private getHostMap(host: string) {
    if (!this.store.has(host)) {
      this.store.set(host, new Map<string, string>());
    }

    return this.store.get(host)!;
  }

  setFromResponse(url: string, response: Response) {
    const host = new URL(url).host;
    const cookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie") as string]
          : [];

    for (const cookie of cookies) {
      const [pair] = cookie.split(";", 1);
      const [name, value] = pair.split("=");

      if (!name || value === undefined) continue;
      this.getHostMap(host).set(normalizeText(name), normalizeText(value));
    }
  }

  getCookieHeader(url: string) {
    const host = new URL(url).host;
    const cookies = this.store.get(host);

    if (!cookies || cookies.size === 0) return null;

    return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

export class DefaultHttpClient implements HttpClient {
  private readonly limit = pLimit(1);
  private readonly jar = new CookieJar();

  async get(url: string, options: HttpRequestOptions = {}) {
    return this.request(url, { method: "GET", headers: options.headers ?? {} });
  }

  async postForm(
    url: string,
    form: URLSearchParams | Record<string, string>,
    options: HttpRequestOptions = {},
  ) {
    const body = form instanceof URLSearchParams ? form : new URLSearchParams(form);

    return this.request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(options.headers ?? {}),
      },
      body: body.toString(),
    });
  }

  private async request(url: string, init: RequestInit): Promise<HttpResponseData> {
    return this.limit(async () => {
      await gentleDelay();
      const cookieHeader = this.jar.getCookieHeader(url);
      const response = await fetch(url, {
        ...init,
        headers: {
          ...DEFAULT_HEADERS,
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
          ...((init.headers as Record<string, string> | undefined) ?? {}),
        },
        redirect: "follow",
      });
      const html = await response.text();
      this.jar.setFromResponse(url, response);
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        url,
        finalUrl: response.url,
        status: response.status,
        html,
        headers,
      };
    });
  }
}
