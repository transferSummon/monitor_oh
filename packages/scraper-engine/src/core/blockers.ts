import type { Blocker, BlockerReason, ScrapeStatus } from "./types";

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function makeBlocker(reason: BlockerReason, message: string, details?: string): Blocker {
  return { reason, message, details };
}

export function dedupeBlockers(blockers: Blocker[]) {
  const seen = new Set<string>();
  const output: Blocker[] = [];

  for (const blocker of blockers) {
    const key = `${blocker.reason}|${blocker.message}`;

    if (seen.has(key)) continue;
    seen.add(key);
    output.push(blocker);
  }

  return output;
}

export function classifyHttpBlockers(status: number, html: string) {
  const lowered = html.toLowerCase();
  const blockers: Blocker[] = [];

  if (status === 403 || hasAny(lowered, [/access denied/, /akamai/, /something.?s up/])) {
    blockers.push(makeBlocker("access_denied", "The site rejected direct access for this request."));
  }

  if (
    hasAny(lowered, [
      /captcha/,
      /captcha-delivery/,
      /please enable js and disable any ad blocker/,
      /enable js/,
    ])
  ) {
    blockers.push(makeBlocker("captcha", "The site presented a captcha or JS challenge."));
  }

  return dedupeBlockers(blockers);
}

export function classifyErrorBlocker(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown transport error.";
  const lowered = message.toLowerCase();

  if (lowered.includes("timeout")) {
    return makeBlocker("timeout", "The request timed out.", message);
  }

  return makeBlocker("transport_error", "The request failed before a usable response was received.", message);
}

export function deriveStatus(recordCount: number, blockers: Blocker[], forceFailed = false): ScrapeStatus {
  if (forceFailed) return "failed";
  if (recordCount >= 3) return "success";
  if (recordCount > 0) return "partial";
  if (blockers.length > 0) return "blocked";
  return "failed";
}
