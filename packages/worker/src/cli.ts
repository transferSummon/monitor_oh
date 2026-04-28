#!/usr/bin/env node

import { runRequestedJob } from "./index";
import { closeDb } from "@olympic/db";

function usage() {
  return [
    "Usage:",
    "  worker run --module offers|marketing|ads [--competitor <slug>]",
  ].join("\n");
}

function getFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command !== "run") {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const module = getFlag(rest, "--module");
  const competitorSlug = getFlag(rest, "--competitor") ?? undefined;

  if (module !== "offers" && module !== "marketing" && module !== "ads") {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const result = await runRequestedJob({
    module,
    competitorSlug,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
