import { dedupeBlockers, deriveStatus } from "./blockers";
import type { CompleteResultInput, ScrapeContext, ScrapeRunResult } from "./types";

export async function completeRunResult(
  context: ScrapeContext,
  input: CompleteResultInput,
): Promise<ScrapeRunResult> {
  const candidatePaths = context.artifactWriter.getArtifactPaths(
    context.runId,
    context.competitor.slug,
    input.capability,
  );
  const artifactPaths = {
    ...candidatePaths,
    rawHtml: input.rawHtml ? candidatePaths.rawHtml : null,
    screenshot: input.screenshot ? candidatePaths.screenshot : null,
  };

  if (input.rawHtml && candidatePaths.rawHtml) {
    await context.artifactWriter.writeRawHtml(candidatePaths.rawHtml, input.rawHtml);
  }

  if (input.screenshot && candidatePaths.screenshot) {
    await context.artifactWriter.writeScreenshot(candidatePaths.screenshot, input.screenshot);
  }

  const records = input.records.map((record) => ({
    ...record,
    evidence: {
      ...record.evidence,
      rawHtmlPath: artifactPaths.rawHtml,
      screenshotPath: artifactPaths.screenshot,
    },
  }));
  const blockers = dedupeBlockers(input.blockers ?? []);

  const result: ScrapeRunResult = {
    runId: context.runId,
    startedAt: context.startedAt,
    finishedAt: new Date().toISOString(),
    competitor: context.competitor.slug,
    capability: input.capability,
    method: input.method,
    status: deriveStatus(records.length, blockers, input.forceFailed ?? false),
    notes: input.notes ?? [],
    blockers,
    records,
    artifactPaths,
  };

  await context.writer.writeRun(result);
  await context.writer.writeRecords(result);
  await context.writer.writeBlocker(result);

  return result;
}
