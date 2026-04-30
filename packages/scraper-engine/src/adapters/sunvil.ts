import { classifyErrorBlocker, classifyHttpBlockers, makeBlocker } from "../core/blockers";
import { completeRunResult } from "../core/result";
import type { CompetitorAdapter } from "../core/types";
import {
  buildSunvilPriceAvailabilityUrl,
  extractFormFields,
  extractSunvilPriceAvailabilityRequest,
  extractSunvilResultsBookingUrls,
  parseSunvilPromotions,
  parseSunvilResultsLivePrices,
} from "../parsers";

const offersUrl = "https://www.sunvil.co.uk/offers";
const discoverUrl = "https://www.sunvil.co.uk/results/discover";
const getPageUrl = "https://www.sunvil.co.uk/results/getpage?pageNumber=1&toFilter=false";
const maxLivePriceBookingPages = 5;

function classifySunvilHttpBlockers(status: number, html: string) {
  return classifyHttpBlockers(status, html).filter((blocker) => {
    if (blocker.reason !== "captcha") return true;

    const passiveRecaptchaScript = /recaptcha\/api\.js|invisible-recaptcha/i.test(html);
    const activeCaptchaChallenge = /captcha-delivery|please enable js|access denied|challenge/i.test(html);

    return !passiveRecaptchaScript || activeCaptchaChallenge;
  });
}

export const sunvilAdapter: CompetitorAdapter = {
  slug: "sunvil",
  async runPromotions(context) {
    const notes = [
      "Sunvil promotions are HTTP-first from the public /offers page.",
    ];

    try {
      const response = await context.httpClient.get(offersUrl);
      const records = parseSunvilPromotions(response.html, new Date().toISOString());
      const blockers = classifySunvilHttpBlockers(response.status, response.html);

      if (records.length === 0) {
        blockers.push(makeBlocker("empty_results", "Sunvil offers page loaded, but no offer cards were extracted."));
      }

      return completeRunResult(context, {
        capability: "promotions",
        method: "http_html",
        notes,
        blockers,
        records,
        rawHtml: response.html,
      });
    } catch (error) {
      return completeRunResult(context, {
        capability: "promotions",
        method: "http_html",
        notes,
        blockers: [classifyErrorBlocker(error)],
        records: [],
        forceFailed: true,
      });
    }
  },
  async runLivePrices(context) {
    const notes = [
      "Sunvil live prices use the discover form session, then the /results/getpage JSON feed.",
      "Each result card is expanded through its booking page and /holiday/priceandavailability to capture exact dated prices.",
    ];

    try {
      const seed = await context.httpClient.get(offersUrl);
      const formFields = extractFormFields(seed.html, "#DiscoverForm");
      formFields.set("DiscoverDepartureFromDate", context.searchWindow.fromDate);
      formFields.set("DiscoverDepartureToDate", context.searchWindow.toDate);
      formFields.set("DiscoverDepartureDates", "");
      formFields.set("DiscoverAdults", String(context.searchWindow.adults));
      formFields.set("DiscoverChildren", "0");
      formFields.set("DiscoverInfants", "0");
      formFields.set("DiscoverPassengers", `${context.searchWindow.adults} Adults`);
      const discover = await context.httpClient.postForm(discoverUrl, formFields, {
        headers: {
          referer: offersUrl,
        },
      });
      const resultsPage = await context.httpClient.get(getPageUrl, {
        headers: {
          accept: "application/json",
          referer: discoverUrl,
        },
      });
      const blockers = [
        ...classifySunvilHttpBlockers(seed.status, seed.html),
        ...classifySunvilHttpBlockers(discover.status, discover.html),
        ...classifySunvilHttpBlockers(resultsPage.status, resultsPage.html),
      ];
      const bookingUrls = extractSunvilResultsBookingUrls(
        resultsPage.html,
        resultsPage.finalUrl,
        maxLivePriceBookingPages,
      );
      const bookingPages: Array<{
        sourceUrl: string;
        html: string;
        availability: string;
        availabilityUrl: string;
      }> = [];

      if (resultsPage.status < 200 || resultsPage.status >= 300) {
        blockers.push(makeBlocker("transport_error", `Sunvil results feed returned HTTP ${resultsPage.status}.`));
      }

      if (bookingUrls.length === 0) {
        blockers.push(makeBlocker("empty_results", "Sunvil results feed returned no booking result cards."));
      }

      for (const bookingUrl of bookingUrls) {
        const booking = await context.httpClient.get(bookingUrl, {
          headers: {
            referer: resultsPage.finalUrl,
          },
        });
        blockers.push(...classifySunvilHttpBlockers(booking.status, booking.html));

        if (booking.status < 200 || booking.status >= 300) {
          blockers.push(makeBlocker("transport_error", `Sunvil booking page returned HTTP ${booking.status}.`, bookingUrl));
          continue;
        }

        const availabilityRequest = extractSunvilPriceAvailabilityRequest(booking.html, bookingUrl);

        if (!availabilityRequest) {
          blockers.push(makeBlocker("selector_drift", "Sunvil booking page no longer exposes price availability parameters.", bookingUrl));
          continue;
        }

        const availabilityUrl = buildSunvilPriceAvailabilityUrl(availabilityRequest);
        const availability = await context.httpClient.get(availabilityUrl, {
          headers: {
            accept: "application/json",
            referer: bookingUrl,
          },
        });
        blockers.push(...classifySunvilHttpBlockers(availability.status, availability.html));

        if (availability.status < 200 || availability.status >= 300) {
          blockers.push(
            makeBlocker(
              "transport_error",
              `Sunvil price availability endpoint returned HTTP ${availability.status}.`,
              availabilityUrl,
            ),
          );
          continue;
        }

        bookingPages.push({
          sourceUrl: bookingUrl,
          html: booking.html,
          availability: availability.html,
          availabilityUrl: availability.finalUrl,
        });
      }

      const combinedPayload = JSON.stringify({
        searchWindow: context.searchWindow,
        resultsPage: resultsPage.html,
        bookingPages,
      });
      const records = parseSunvilResultsLivePrices(combinedPayload, resultsPage.finalUrl, new Date().toISOString());

      if (records.length === 0) {
        blockers.push(makeBlocker("empty_results", "Sunvil live price flow returned no exact dated availability records."));
      }

      return completeRunResult(context, {
        capability: "live-prices",
        method: "http_form",
        notes,
        blockers,
        records,
        rawHtml: combinedPayload,
      });
    } catch (error) {
      return completeRunResult(context, {
        capability: "live-prices",
        method: "http_form",
        notes,
        blockers: [classifyErrorBlocker(error)],
        records: [],
        forceFailed: true,
      });
    }
  },
};
