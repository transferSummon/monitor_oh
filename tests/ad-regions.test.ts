import assert from "node:assert/strict";
import test from "node:test";

import { formatRegions } from "../src/components/dashboard/adUtils";
import type { CreativeRecord } from "../src/types/snapshot";

const adWithRegions = (
  regions: unknown,
  metadata: Record<string, unknown> | null = null,
  region: string | null = null,
) =>
  ({
    regions,
    metadata,
    region,
  }) as CreativeRecord;

test("formats stored ad snapshot regions", () => {
  assert.equal(
    formatRegions(
      adWithRegions([
        {
          location_name: "United Kingdom",
          platform: "all",
          target: "tui.co.uk",
        },
      ]),
    ),
    "United Kingdom",
  );
});

test("formats string region arrays", () => {
  assert.equal(formatRegions(adWithRegions(["GB"])), "GB");
});

test("formats nested metadata regions", () => {
  assert.equal(
    formatRegions(
      adWithRegions({
        regions: [
          {
            location_name: "United Kingdom",
          },
        ],
      }),
    ),
    "United Kingdom",
  );
});

test("falls back for empty regions", () => {
  assert.equal(formatRegions(adWithRegions(null)), "Unknown");
});
