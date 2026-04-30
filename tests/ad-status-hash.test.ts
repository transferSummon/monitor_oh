import assert from "node:assert/strict";
import test from "node:test";

import {
  createStableAdSnapshotHash,
  decideAdStatusRepair,
  decideRemovedStatusRepair,
  getAdPersistChangeType,
  getRestoredAdStatus,
  getReturnedAdLifecycleAction,
  isConfirmedRemovedSnapshot,
  isGoogleAdShownOnRunDate,
  type StableAdSnapshotHashInput,
} from "../packages/worker/src/index";

const baseHashInput: StableAdSnapshotHashInput & {
  firstShown?: string | null;
  lastShown?: string | null;
} = {
  advertiserId: "AR123",
  advertiserTitle: "TUI UK Limited",
  creativeId: "CR123",
  format: "text",
  transparencyUrl: "https://adstransparency.google.com/advertiser/AR123/creative/CR123?region=GB",
  verified: true,
  previewImageUrl: "https://tpc.googlesyndication.com/archive/simgad/123",
  previewImageHeight: 420,
  previewImageWidth: 365,
  previewUrl: null,
  target: "tui.co.uk",
  firstShown: "2026-04-28T10:00:00.000Z",
  lastShown: "2026-04-28T10:00:00.000Z",
};

test("stable ad hash ignores firstShown and lastShown", () => {
  const originalHash = createStableAdSnapshotHash(baseHashInput);
  const dateOnlyHash = createStableAdSnapshotHash({
    ...baseHashInput,
    firstShown: "2026-04-01T10:00:00.000Z",
    lastShown: "2026-04-29T10:00:00.000Z",
  });

  assert.equal(dateOnlyHash, originalHash);
});

test("stable ad hash changes when creative media changes", () => {
  assert.notEqual(
    createStableAdSnapshotHash({ ...baseHashInput, previewImageUrl: "https://example.com/new-image" }),
    createStableAdSnapshotHash(baseHashInput),
  );
  assert.notEqual(
    createStableAdSnapshotHash({ ...baseHashInput, previewImageHeight: 421 }),
    createStableAdSnapshotHash(baseHashInput),
  );
});

test("stable ad hash changes when creative metadata changes", () => {
  assert.notEqual(
    createStableAdSnapshotHash({ ...baseHashInput, format: "video" }),
    createStableAdSnapshotHash(baseHashInput),
  );
  assert.notEqual(
    createStableAdSnapshotHash({ ...baseHashInput, advertiserTitle: "Different Advertiser" }),
    createStableAdSnapshotHash(baseHashInput),
  );
  assert.notEqual(
    createStableAdSnapshotHash({ ...baseHashInput, previewUrl: "https://example.com/preview.js" }),
    createStableAdSnapshotHash(baseHashInput),
  );
});

test("classifies ad persistence changes from stable hashes", () => {
  const stableHash = createStableAdSnapshotHash(baseHashInput);
  const changedHash = createStableAdSnapshotHash({ ...baseHashInput, previewImageUrl: "https://example.com/new" });

  assert.equal(getAdPersistChangeType({ exists: false, nextStableHash: stableHash }), "new");
  assert.equal(
    getAdPersistChangeType({
      exists: true,
      previousStatus: "active",
      previousStableHash: stableHash,
      nextStableHash: stableHash,
    }),
    null,
  );
  assert.equal(
    getAdPersistChangeType({
      exists: true,
      previousStatus: "active",
      previousStableHash: stableHash,
      nextStableHash: changedHash,
    }),
    "changed",
  );
  assert.equal(
    getAdPersistChangeType({
      exists: true,
      previousStatus: "removed",
      previousStableHash: stableHash,
      nextStableHash: stableHash,
    }),
    "changed",
  );
});

test("classifies whether Google lastShown is current for a run date", () => {
  assert.equal(isGoogleAdShownOnRunDate("2026-04-29T00:01:00.000Z", "2026-04-29"), true);
  assert.equal(isGoogleAdShownOnRunDate("2026-04-28T23:59:59.000Z", "2026-04-29"), false);
  assert.equal(isGoogleAdShownOnRunDate(null, "2026-04-29"), true);
});

test("classifies returned ad lifecycle using Google lastShown freshness", () => {
  const stableHash = createStableAdSnapshotHash(baseHashInput);
  const changedHash = createStableAdSnapshotHash({ ...baseHashInput, previewImageUrl: "https://example.com/new" });

  assert.equal(
    getReturnedAdLifecycleAction({
      exists: false,
      nextStableHash: stableHash,
      isCurrentlyShown: true,
    }),
    "new",
  );
  assert.equal(
    getReturnedAdLifecycleAction({
      exists: false,
      nextStableHash: stableHash,
      isCurrentlyShown: false,
    }),
    "removed",
  );
  assert.equal(
    getReturnedAdLifecycleAction({
      exists: true,
      previousStatus: "active",
      previousStableHash: stableHash,
      nextStableHash: stableHash,
      isCurrentlyShown: false,
    }),
    "removed",
  );
  assert.equal(
    getReturnedAdLifecycleAction({
      exists: true,
      previousStatus: "removed",
      previousStableHash: stableHash,
      nextStableHash: stableHash,
      isCurrentlyShown: false,
    }),
    null,
  );
  assert.equal(
    getReturnedAdLifecycleAction({
      exists: true,
      previousStatus: "removed",
      previousStableHash: stableHash,
      nextStableHash: stableHash,
      isCurrentlyShown: true,
    }),
    "changed",
  );
  assert.equal(
    getReturnedAdLifecycleAction({
      exists: true,
      previousStatus: "active",
      previousStableHash: stableHash,
      nextStableHash: changedHash,
      isCurrentlyShown: true,
    }),
    "changed",
  );
});

test("classifies ad status repair decisions conservatively", () => {
  const stableHash = createStableAdSnapshotHash(baseHashInput);
  const changedHash = createStableAdSnapshotHash({ ...baseHashInput, previewImageUrl: "https://example.com/new" });

  assert.deepEqual(
    decideAdStatusRepair({
      status: "changed",
      becameRemovedDate: null,
      hasPreviousSnapshot: true,
      latestStableHash: stableHash,
      previousStableHash: stableHash,
      shouldBeNew: true,
    }),
    { action: "repair", status: "new" },
  );
  assert.deepEqual(
    decideAdStatusRepair({
      status: "changed",
      becameRemovedDate: null,
      hasPreviousSnapshot: true,
      latestStableHash: stableHash,
      previousStableHash: stableHash,
      shouldBeNew: false,
    }),
    { action: "repair", status: "active" },
  );
  assert.deepEqual(
    decideAdStatusRepair({
      status: "changed",
      becameRemovedDate: null,
      hasPreviousSnapshot: true,
      latestStableHash: changedHash,
      previousStableHash: stableHash,
      shouldBeNew: true,
    }),
    { action: "preserve", reason: "different_stable_hash" },
  );
  assert.deepEqual(
    decideAdStatusRepair({
      status: "changed",
      becameRemovedDate: "2026-04-29",
      hasPreviousSnapshot: true,
      latestStableHash: stableHash,
      previousStableHash: stableHash,
      shouldBeNew: true,
    }),
    { action: "preserve", reason: "reappeared_removed" },
  );
  assert.deepEqual(
    decideAdStatusRepair({
      status: "changed",
      becameRemovedDate: null,
      hasPreviousSnapshot: false,
      latestStableHash: stableHash,
      previousStableHash: null,
      shouldBeNew: true,
    }),
    { action: "preserve", reason: "no_previous_snapshot" },
  );
});

test("detects confirmed removed snapshots only from returned stale Google data", () => {
  assert.equal(
    isConfirmedRemovedSnapshot({
      becameRemovedDate: "2026-04-29",
      latestSnapshotDate: "2026-04-29",
      latestRawLastShown: "2026-04-28 23:59:59 +00:00",
    }),
    true,
  );
  assert.equal(
    isConfirmedRemovedSnapshot({
      becameRemovedDate: "2026-04-29",
      latestSnapshotDate: "2026-04-29",
      latestRawLastShown: "2026-04-29 00:00:01 +00:00",
    }),
    false,
  );
  assert.equal(
    isConfirmedRemovedSnapshot({
      becameRemovedDate: "2026-04-29",
      latestSnapshotDate: "2026-04-28",
      latestRawLastShown: "2026-04-28 10:00:00 +00:00",
    }),
    false,
  );
});

test("restores unconfirmed removed statuses to the right lifecycle bucket", () => {
  assert.equal(
    getRestoredAdStatus({
      becameNewDate: "2026-04-29",
      changedDate: null,
      runDate: "2026-04-29",
    }),
    "new",
  );
  assert.equal(
    getRestoredAdStatus({
      becameNewDate: "2026-04-10",
      changedDate: "2026-04-28",
      runDate: "2026-04-29",
    }),
    "changed",
  );
  assert.equal(
    getRestoredAdStatus({
      becameNewDate: "2026-04-10",
      changedDate: "2026-04-20",
      runDate: "2026-04-29",
    }),
    "active",
  );
});

test("classifies removed status repair decisions from confirmation evidence", () => {
  assert.deepEqual(
    decideRemovedStatusRepair({
      status: "removed",
      becameNewDate: "2026-04-20",
      changedDate: null,
      becameRemovedDate: "2026-04-29",
      latestSnapshotDate: "2026-04-29",
      latestRawLastShown: "2026-04-28 10:00:00 +00:00",
      runDate: "2026-04-29",
    }),
    { action: "preserve", reason: "confirmed_removed" },
  );
  assert.deepEqual(
    decideRemovedStatusRepair({
      status: "removed",
      becameNewDate: "2026-04-29",
      changedDate: null,
      becameRemovedDate: "2026-04-29",
      latestSnapshotDate: "2026-04-29",
      latestRawLastShown: "2026-04-29 00:00:01 +00:00",
      runDate: "2026-04-29",
    }),
    { action: "restore", status: "new" },
  );
  assert.deepEqual(
    decideRemovedStatusRepair({
      status: "removed",
      becameNewDate: "2026-04-10",
      changedDate: null,
      becameRemovedDate: "2026-04-29",
      latestSnapshotDate: "2026-04-28",
      latestRawLastShown: "2026-04-28 10:00:00 +00:00",
      runDate: "2026-04-29",
    }),
    { action: "restore", status: "active" },
  );
});
