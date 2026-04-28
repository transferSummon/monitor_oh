import test from "node:test";
import assert from "node:assert/strict";

import { classifyErrorBlocker, classifyHttpBlockers, deriveStatus } from "../../src/core/blockers";

test("classifyHttpBlockers detects access denied", () => {
  const blockers = classifyHttpBlockers(403, "<html><title>Access Denied</title></html>");
  assert.equal(blockers[0]?.reason, "access_denied");
});

test("classifyHttpBlockers detects captcha or JS gate", () => {
  const blockers = classifyHttpBlockers(
    403,
    "<html>Please enable JS and disable any ad blocker<script src='captcha-delivery'></script></html>",
  );
  assert.ok(blockers.some((blocker) => blocker.reason === "captcha"));
});

test("classifyErrorBlocker detects timeout messages", () => {
  const blocker = classifyErrorBlocker(new Error("Request timeout after 45000ms"));
  assert.equal(blocker.reason, "timeout");
});

test("deriveStatus prefers success, partial, and blocked states", () => {
  assert.equal(deriveStatus(4, []), "success");
  assert.equal(deriveStatus(1, []), "partial");
  assert.equal(deriveStatus(0, [{ reason: "empty_results", message: "No records" }]), "blocked");
});
