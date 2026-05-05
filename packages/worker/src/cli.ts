#!/usr/bin/env node

import type { CompetitorModule, JobRunResponse, JobRunStatus } from "@olympic/contracts";
import { closeDb, hasDatabase } from "@olympic/db";

import {
  backfillAdClassifications,
  backfillDestinationAssignments,
  createBatchRunId,
  finishJobBatch,
  inspectLatestBatch,
  repairAdStatuses,
  runRequestedJob,
  startJobBatch,
  type WorkerLogEvent,
} from "./index";

const WORKER_MODULES: CompetitorModule[] = ["offers", "marketing", "ads"];

function usage() {
  return [
    "Usage:",
    "  worker run --module offers|marketing|ads [--competitor <slug>] [--batch-run-id <id>] [--json-logs]",
    "  worker run-all [--modules offers,marketing,ads]",
    "  worker backfill-ads [--ocr-missing] [--limit <count>]",
    "  worker backfill-destinations --dry-run|--apply [--module all|ads|offers] [--limit <count>]",
    "  worker repair-ad-statuses --dry-run|--apply",
    "  worker inspect --latest",
  ].join("\n");
}

function getFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag);
}

function parseModules(value: string | null) {
  if (!value) return WORKER_MODULES;

  const modules = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (modules.length === 0) return WORKER_MODULES;

  for (const module of modules) {
    if (module !== "offers" && module !== "marketing" && module !== "ads") {
      throw new Error(`Unsupported module in --modules: ${module}`);
    }
  }

  return modules as CompetitorModule[];
}

function toOverallStatus(statuses: JobRunStatus[]) {
  if (statuses.length === 0) return "failed" satisfies JobRunStatus;
  if (statuses.every((status) => status === "success")) return "success" satisfies JobRunStatus;
  if (statuses.every((status) => status === "blocked")) return "blocked" satisfies JobRunStatus;
  if (statuses.every((status) => status === "failed")) return "failed" satisfies JobRunStatus;
  return "partial" satisfies JobRunStatus;
}

function logJson(event: WorkerLogEvent & { summary?: unknown; modules?: unknown }) {
  const payload = {
    observedAt: new Date().toISOString(),
    event: event.event,
    batchRunId: event.batchRunId ?? null,
    module: event.module ?? null,
    competitorSlug: event.competitorSlug ?? null,
    status: event.status ?? null,
    durationMs: event.durationMs ?? null,
    recordsSeen: event.recordsSeen ?? 0,
    recordsChanged: event.recordsChanged ?? 0,
    runId: event.runId ?? null,
    errorCode: event.errorCode ?? null,
    message: event.message ?? null,
    ...(event.summary === undefined ? {} : { summary: event.summary }),
    ...(event.modules === undefined ? {} : { modules: event.modules }),
  };

  const line = JSON.stringify(payload);

  if (event.event.endsWith(".failed")) {
    console.error(line);
    return;
  }

  console.log(line);
}

async function runOne(args: string[]) {
  const module = getFlag(args, "--module");
  const competitorSlug = getFlag(args, "--competitor") ?? undefined;
  const batchRunId = getFlag(args, "--batch-run-id");
  const jsonLogs = hasFlag(args, "--json-logs");

  if (module !== "offers" && module !== "marketing" && module !== "ads") {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (batchRunId && hasDatabase()) {
    await startJobBatch(batchRunId);
  }

  const result = await runRequestedJob(
    {
      module,
      competitorSlug,
    },
    {
      batchRunId,
      logger: jsonLogs ? logJson : undefined,
    },
  );

  if (batchRunId && hasDatabase()) {
    await finishJobBatch(batchRunId, result.status, {
      status: result.status,
      recordsSeen: result.counts.recordsSeen ?? 0,
      recordsChanged: result.counts.recordsChanged ?? 0,
      modules: [result],
    });
  }

  if (jsonLogs) {
    logJson({
      event: "job.result",
      batchRunId,
      module,
      competitorSlug: competitorSlug ?? null,
      status: result.status,
      recordsSeen: result.counts.recordsSeen ?? 0,
      recordsChanged: result.counts.recordsChanged ?? 0,
      runId: result.runId,
      message: result.message,
      summary: result,
    });
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

async function runAll(args: string[]) {
  if (!hasDatabase()) {
    logJson({
      event: "batch.failed",
      status: "failed",
      errorCode: "missing_database_url",
      message: "DATABASE_URL is required for worker run-all.",
    });
    process.exitCode = 1;
    return;
  }

  const modules = parseModules(getFlag(args, "--modules"));
  const batchRunId = createBatchRunId();
  const batchStartedAt = Date.now();
  const results: JobRunResponse[] = [];
  const statuses: JobRunStatus[] = [];

  await startJobBatch(batchRunId);

  logJson({
    event: "batch.started",
    batchRunId,
    status: "running",
    message: `Worker batch started for modules: ${modules.join(", ")}.`,
  });

  for (const module of modules) {
    const moduleStartedAt = Date.now();

    logJson({
      event: "module.started",
      batchRunId,
      module,
      status: "running",
      message: `${module} module started.`,
    });

    try {
      const result = await runRequestedJob(
        { module },
        {
          batchRunId,
          logger: logJson,
        },
      );

      results.push(result);
      statuses.push(result.status);

      logJson({
        event: "module.finished",
        batchRunId,
        module,
        status: result.status,
        durationMs: Date.now() - moduleStartedAt,
        recordsSeen: result.counts.recordsSeen ?? 0,
        recordsChanged: result.counts.recordsChanged ?? 0,
        runId: result.runId,
        message: result.message,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown module worker error.";

      statuses.push("failed");
      results.push({
        ok: false,
        module,
        status: "failed",
        competitorSlug: null,
        message,
        runId: null,
        counts: {
          recordsSeen: 0,
          recordsChanged: 0,
          competitorsProcessed: 0,
        },
      });

      logJson({
        event: "module.failed",
        batchRunId,
        module,
        status: "failed",
        durationMs: Date.now() - moduleStartedAt,
        errorCode: "module_error",
        message,
      });
    }
  }

  const status = toOverallStatus(statuses);
  const summary = {
    status,
    recordsSeen: results.reduce((sum, result) => sum + Number(result.counts.recordsSeen ?? 0), 0),
    recordsChanged: results.reduce((sum, result) => sum + Number(result.counts.recordsChanged ?? 0), 0),
    modules: results,
  };

  await finishJobBatch(batchRunId, status, summary);

  logJson({
    event: "batch.finished",
    batchRunId,
    status,
    durationMs: Date.now() - batchStartedAt,
    recordsSeen: summary.recordsSeen,
    recordsChanged: summary.recordsChanged,
    message: `Worker batch ${status}.`,
    summary,
  });
}

async function inspect(args: string[]) {
  if (!hasFlag(args, "--latest")) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const result = await inspectLatestBatch();
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function backfillAds(args: string[]) {
  const limitValue = getFlag(args, "--limit");
  const parsedLimit = Number.parseInt(limitValue ?? "", 10);
  const result = await backfillAdClassifications({
    ocrMissing: hasFlag(args, "--ocr-missing"),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function backfillDestinations(args: string[]) {
  const apply = hasFlag(args, "--apply");
  const dryRun = hasFlag(args, "--dry-run");
  const moduleValue = getFlag(args, "--module") ?? "all";
  const limitValue = getFlag(args, "--limit");
  const parsedLimit = Number.parseInt(limitValue ?? "", 10);

  if (apply === dryRun) {
    console.error("Use exactly one of --dry-run or --apply.");
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (moduleValue !== "all" && moduleValue !== "ads" && moduleValue !== "offers") {
    console.error("Use --module all, --module ads, or --module offers.");
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const result = await backfillDestinationAssignments({
    module: moduleValue,
    apply,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function repairAds(args: string[]) {
  const apply = hasFlag(args, "--apply");
  const dryRun = hasFlag(args, "--dry-run");

  if (apply === dryRun) {
    console.error("Use exactly one of --dry-run or --apply.");
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const result = await repairAdStatuses({ apply });
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "run":
      await runOne(rest);
      return;
    case "run-all":
      await runAll(rest);
      return;
    case "backfill-ads":
      await backfillAds(rest);
      return;
    case "backfill-destinations":
      await backfillDestinations(rest);
      return;
    case "repair-ad-statuses":
      await repairAds(rest);
      return;
    case "inspect":
      await inspect(rest);
      return;
    default:
      console.error(usage());
      process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
