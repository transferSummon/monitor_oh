import { promises as fs } from "node:fs";
import path from "node:path";

import type { ProbeRunArtifact } from "@/lib/probes/types";

const tmpRoot = path.join(process.cwd(), "tmp");
const runRoot = path.join(tmpRoot, "probe-runs");
const screenshotRoot = path.join(tmpRoot, "screenshots");
const latestFile = path.join(tmpRoot, "latest.json");

export function getTmpRoot() {
  return tmpRoot;
}

export async function ensureStorage() {
  await fs.mkdir(runRoot, { recursive: true });
  await fs.mkdir(screenshotRoot, { recursive: true });
}

export async function writeRunArtifact(artifact: ProbeRunArtifact) {
  await ensureStorage();
  const fileName = `${artifact.runId}.json`;
  const runFile = path.join(runRoot, fileName);
  const payload = JSON.stringify(artifact, null, 2);

  await fs.writeFile(runFile, payload, "utf8");
  await fs.writeFile(latestFile, payload, "utf8");
}

export async function readLatestRunArtifact(): Promise<ProbeRunArtifact | null> {
  try {
    const raw = await fs.readFile(latestFile, "utf8");
    return JSON.parse(raw) as ProbeRunArtifact;
  } catch {
    return null;
  }
}

export async function readAllRunArtifacts(): Promise<ProbeRunArtifact[]> {
  try {
    const files = await fs.readdir(runRoot);
    const artifacts = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const raw = await fs.readFile(path.join(runRoot, file), "utf8");
          return JSON.parse(raw) as ProbeRunArtifact;
        }),
    );

    return artifacts.sort((left, right) => right.finishedAt.localeCompare(left.finishedAt));
  } catch {
    return [];
  }
}

export async function writeScreenshot(
  relativePath: string,
  data: Buffer,
): Promise<string> {
  await ensureStorage();
  const absolutePath = path.join(tmpRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, data);
  return relativePath.replaceAll(path.sep, "/");
}

export function resolveArtifactPath(relativePath: string): string | null {
  const absolutePath = path.resolve(tmpRoot, relativePath);
  const relativeToTmp = path.relative(tmpRoot, absolutePath);

  if (relativeToTmp.startsWith("..") || path.isAbsolute(relativeToTmp)) {
    return null;
  }

  return absolutePath;
}
