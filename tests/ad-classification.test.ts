import assert from "node:assert/strict";
import test from "node:test";

import { destinationSeed } from "../packages/db/src/seeds";
import { matchDestinationAssignments, matchDestinationId } from "../packages/worker/src/index";

function destinationId(slug: string) {
  const destination = destinationSeed.find((item) => item.slug === slug);
  assert.ok(destination, `Missing destination seed: ${slug}`);
  return destination.id;
}

function assignmentSlugs(text: string) {
  const competitorId = 3;
  return matchDestinationAssignments(text, competitorId)
    .map((assignment) => destinationSeed.find((item) => item.id === assignment.destinationId)?.slug)
    .filter(Boolean);
}

test("matches package-holiday OCR destinations", () => {
  const competitorId = 3;

  assert.equal(matchDestinationId("Book Ibiza Holidays today", competitorId), 58);
  assert.equal(matchDestinationId("Malta Holidays from £299", competitorId), 62);
  assert.equal(matchDestinationId("Faro Holidays 2026/2027", competitorId), 61);
  assert.equal(matchDestinationId("Halkidiki Holidays", competitorId), destinationId("halkidiki"));
  assert.equal(matchDestinationId("Marmaris Holidays - Low Deposits", competitorId), 63);
  assert.equal(matchDestinationId("Maldives all inclusive holidays", competitorId), 17);
  assert.equal(matchDestinationId("Red Sea Egypt packages", competitorId), 40);
  assert.equal(matchDestinationId("All Inclusive Italy holidays", competitorId), 57);
  assert.equal(matchDestinationId("All Inclusive Thailand", competitorId), 11);
});

test("returns Greece rollup with Greek child destinations", () => {
  assert.deepEqual(assignmentSlugs("Zante holidays"), ["greece", "zante"]);
  assert.deepEqual(assignmentSlugs("Crete and Rhodes deals"), ["greece", "crete", "rhodes"]);
  assert.deepEqual(assignmentSlugs("Greek island holidays"), ["greece"]);
});
