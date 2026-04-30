import assert from "node:assert/strict";
import test from "node:test";

import { matchDestinationId } from "../packages/worker/src/index";

test("matches package-holiday OCR destinations", () => {
  const competitorId = 3;

  assert.equal(matchDestinationId("Book Ibiza Holidays today", competitorId), 58);
  assert.equal(matchDestinationId("Malta Holidays from £299", competitorId), 62);
  assert.equal(matchDestinationId("Faro Holidays 2026/2027", competitorId), 61);
  assert.equal(matchDestinationId("Halkidiki Holidays", competitorId), 59);
  assert.equal(matchDestinationId("Marmaris Holidays - Low Deposits", competitorId), 63);
  assert.equal(matchDestinationId("Maldives all inclusive holidays", competitorId), 17);
  assert.equal(matchDestinationId("Red Sea Egypt packages", competitorId), 40);
  assert.equal(matchDestinationId("All Inclusive Italy holidays", competitorId), 57);
  assert.equal(matchDestinationId("All Inclusive Thailand", competitorId), 11);
});
