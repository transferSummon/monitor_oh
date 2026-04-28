import { promises as fs } from "node:fs";
import path from "node:path";

import type { AdsArtifactSummary } from "./types";

export async function writeAdsArtifact(summary: AdsArtifactSummary) {
  const rootDir = process.env.INIT_CWD || process.cwd();
  const relativeSummaryPath = path.posix.join("runs", "ads", summary.runId, "summary.json");
  const absoluteSummaryPath = path.resolve(rootDir, relativeSummaryPath);
  const latestPath = path.resolve(rootDir, "runs", "ads", "latest.json");

  await fs.mkdir(path.dirname(absoluteSummaryPath), { recursive: true });
  await fs.writeFile(absoluteSummaryPath, JSON.stringify(summary, null, 2), "utf8");
  await fs.mkdir(path.dirname(latestPath), { recursive: true });
  await fs.writeFile(latestPath, JSON.stringify({ ...summary, summaryPath: relativeSummaryPath }, null, 2), "utf8");

  return relativeSummaryPath;
}
