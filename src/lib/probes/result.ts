import type {
  LivePriceProbeResult,
  LivePriceSample,
  ProbeMethod,
  PromotionProbeResult,
  PromotionSample,
} from "@/lib/probes/types";
import { finalizeStatus, pickHtmlSnippet } from "@/lib/probes/utils";

interface SharedResultInput {
  competitor: PromotionProbeResult["competitor"];
  sourceUrl: string;
  observedAt?: string;
  method: ProbeMethod;
  notes?: string[];
  blockers?: string[];
  screenshotPath?: string | null;
  htmlSnippet?: string | null;
  forceFailed?: boolean;
}

export function makePromotionResult(
  input: SharedResultInput & {
    samples: PromotionSample[];
  },
): PromotionProbeResult {
  return {
    competitor: input.competitor,
    probeType: "promotions",
    status: finalizeStatus(input.samples.length, input.blockers ?? [], input.forceFailed),
    method: input.method,
    sourceUrl: input.sourceUrl,
    observedAt: input.observedAt ?? new Date().toISOString(),
    sampleCount: input.samples.length,
    samples: input.samples,
    notes: input.notes ?? [],
    blockers: input.blockers ?? [],
    screenshotPath: input.screenshotPath ?? null,
    htmlSnippet: pickHtmlSnippet(input.htmlSnippet),
  };
}

export function makeLivePriceResult(
  input: SharedResultInput & {
    samples: LivePriceSample[];
  },
): LivePriceProbeResult {
  return {
    competitor: input.competitor,
    probeType: "live_prices",
    status: finalizeStatus(input.samples.length, input.blockers ?? [], input.forceFailed),
    method: input.method,
    sourceUrl: input.sourceUrl,
    observedAt: input.observedAt ?? new Date().toISOString(),
    sampleCount: input.samples.length,
    samples: input.samples,
    notes: input.notes ?? [],
    blockers: input.blockers ?? [],
    screenshotPath: input.screenshotPath ?? null,
    htmlSnippet: pickHtmlSnippet(input.htmlSnippet),
  };
}
