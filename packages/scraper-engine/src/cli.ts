#!/usr/bin/env node

import { COMPETITORS } from "./core/competitors";
import { inspectLatestRun, runAllScrapes, runScrape } from "./core/runner";
import type { Capability, ScrapeRunResult, ScrapeRunSummary } from "./core/types";
import { ADAPTERS } from "./adapters";

function usage() {
  return [
    "Usage:",
    "  scrape run --competitor <slug> --capability promotions|live-prices",
    "  scrape run-all",
    "  scrape inspect --latest",
  ].join("\n");
}

function getFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function printRun(result: ScrapeRunResult) {
  const blockers =
    result.blockers.length > 0
      ? result.blockers.map((blocker) => `${blocker.reason}: ${blocker.message}`).join("; ")
      : "none";
  console.log(
    [
      `${result.competitor} ${result.capability}`,
      `status=${result.status}`,
      `method=${result.method}`,
      `records=${result.records.length}`,
      `blockers=${blockers}`,
      `result=${result.artifactPaths.resultJson}`,
    ].join(" | "),
  );
}

function printSummary(summary: ScrapeRunSummary) {
  console.log(`runId=${summary.runId}`);
  console.log(`startedAt=${summary.startedAt}`);
  console.log(`finishedAt=${summary.finishedAt}`);
  if (summary.summaryPath) {
    console.log(`summary=${summary.summaryPath}`);
  }

  for (const result of summary.results) {
    printRun(result);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (command === "run") {
    const competitor = getFlag(rest, "--competitor");
    const capability = getFlag(rest, "--capability") as Capability | null;

    if (!competitor || !capability) {
      console.error(usage());
      process.exitCode = 1;
      return;
    }

    if (!COMPETITORS.some((entry) => entry.slug === competitor)) {
      console.error(`Unknown competitor: ${competitor}`);
      process.exitCode = 1;
      return;
    }

    if (capability !== "promotions" && capability !== "live-prices") {
      console.error(`Unknown capability: ${capability}`);
      process.exitCode = 1;
      return;
    }

    const result = await runScrape({
      competitor: competitor as (typeof COMPETITORS)[number]["slug"],
      capability,
      adapters: ADAPTERS,
    });
    printRun(result);
    return;
  }

  if (command === "run-all") {
    const summary = await runAllScrapes({
      adapters: ADAPTERS,
    });
    printSummary(summary);
    return;
  }

  if (command === "inspect" && rest.includes("--latest")) {
    const summary = await inspectLatestRun();

    if (!summary) {
      console.error("No latest run summary was found.");
      process.exitCode = 1;
      return;
    }

    printSummary(summary);
    return;
  }

  console.error(usage());
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
