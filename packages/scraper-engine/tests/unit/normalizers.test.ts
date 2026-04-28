import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalUrl,
  extractCurrency,
  extractDate,
  extractPrice,
} from "../../src/core/normalizers";

test("canonicalUrl removes tracking params and hash", () => {
  assert.equal(
    canonicalUrl("https://example.com/offer?utm_source=newsletter&gclid=abc&id=7#section"),
    "https://example.com/offer?id=7",
  );
});

test("extractPrice handles GBP and pp formats", () => {
  assert.equal(extractPrice("7 nights from £239pp"), "£239pp");
  assert.equal(extractPrice("Holiday total £1,299 per person"), "£1,299 per person");
});

test("extractDate finds UK-style travel dates", () => {
  assert.equal(extractDate("Departs 12 July 2026 for 7 nights"), "12 July 2026");
});

test("extractCurrency identifies GBP", () => {
  assert.equal(extractCurrency("£799pp"), "GBP");
  assert.equal(extractCurrency("$899"), null);
});
