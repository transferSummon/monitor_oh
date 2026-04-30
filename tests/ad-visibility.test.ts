import assert from "node:assert/strict";
import test from "node:test";

import { isAdVisibleForLatestRun } from "../src/lib/server/repository";

test("shows non-removed ads observed in the latest successful run", () => {
  assert.equal(
    isAdVisibleForLatestRun({
      status: "new",
      latestJobRunId: "ads-tui-latest",
      latestJobStartedAt: "2026-04-29T11:44:40.000Z",
      observedRunId: "ads-tui-latest",
      latestSnapshotCreatedAt: "2026-04-29T11:46:00.000Z",
    }),
    true,
  );
});

test("hides non-removed ads not observed in the latest successful run", () => {
  assert.equal(
    isAdVisibleForLatestRun({
      status: "active",
      latestJobRunId: "ads-tui-latest",
      latestJobStartedAt: "2026-04-29T11:44:40.000Z",
      observedRunId: "ads-tui-previous",
      latestSnapshotCreatedAt: "2026-04-29T02:06:44.000Z",
    }),
    false,
  );
});

test("always shows confirmed removed ads", () => {
  assert.equal(
    isAdVisibleForLatestRun({
      status: "removed",
      latestJobRunId: "ads-tui-latest",
      latestJobStartedAt: "2026-04-29T11:44:40.000Z",
      observedRunId: "ads-tui-previous",
      latestSnapshotCreatedAt: "2026-04-29T02:06:44.000Z",
    }),
    true,
  );
});

test("uses snapshot creation fallback for old snapshots without observed run metadata", () => {
  assert.equal(
    isAdVisibleForLatestRun({
      status: "changed",
      latestJobRunId: "ads-tui-latest",
      latestJobStartedAt: "2026-04-29T11:44:40.000Z",
      observedRunId: null,
      latestSnapshotCreatedAt: "2026-04-29T11:46:00.000Z",
    }),
    true,
  );
  assert.equal(
    isAdVisibleForLatestRun({
      status: "changed",
      latestJobRunId: "ads-tui-latest",
      latestJobStartedAt: "2026-04-29T11:44:40.000Z",
      observedRunId: null,
      latestSnapshotCreatedAt: "2026-04-29T02:06:44.000Z",
    }),
    false,
  );
});
