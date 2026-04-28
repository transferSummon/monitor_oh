import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ArtifactPaths,
  ArtifactWriter,
  Capability,
  CompetitorSlug,
  ScrapeRunResult,
  ScrapeRunSummary,
  Writer,
} from "./types";

export class LocalArtifactWriter implements Writer, ArtifactWriter {
  private readonly rootDir: string;
  private readonly runsRoot: string;

  constructor(baseDir = process.env.INIT_CWD || process.cwd()) {
    this.rootDir = path.resolve(baseDir);
    this.runsRoot = path.join(this.rootDir, "runs");
  }

  getRootDir() {
    return this.rootDir;
  }

  getArtifactPaths(runId: string, competitor: CompetitorSlug, capability: Capability): ArtifactPaths {
    const prefix = path.posix.join("runs", runId, competitor, capability);

    return {
      resultJson: path.posix.join(prefix, "result.json"),
      rawHtml: path.posix.join(prefix, "raw.html"),
      screenshot: path.posix.join(prefix, "screenshot.png"),
      recordsJson: path.posix.join(prefix, "records.json"),
      blockersJson: path.posix.join(prefix, "blockers.json"),
    };
  }

  async writeRun(result: ScrapeRunResult) {
    await this.writeJson(result.artifactPaths.resultJson, result);
  }

  async writeRecords(result: ScrapeRunResult) {
    if (!result.artifactPaths.recordsJson) return;
    await this.writeJson(result.artifactPaths.recordsJson, result.records);
  }

  async writeBlocker(result: ScrapeRunResult) {
    if (!result.artifactPaths.blockersJson || result.blockers.length === 0) return;
    await this.writeJson(result.artifactPaths.blockersJson, result.blockers);
  }

  async writeRawHtml(relativePath: string, html: string) {
    await this.writeFile(relativePath, html);
  }

  async writeScreenshot(relativePath: string, data: Buffer) {
    await this.writeBuffer(relativePath, data);
  }

  async writeSummary(summary: ScrapeRunSummary) {
    const summaryPath = path.posix.join("runs", summary.runId, "summary.json");
    await this.writeJson(summaryPath, summary);
    await this.writeJson(path.posix.join("runs", "latest.json"), {
      ...summary,
      summaryPath,
    });
    return summaryPath;
  }

  async readLatestSummary() {
    try {
      const absolutePath = path.join(this.runsRoot, "latest.json");
      const raw = await fs.readFile(absolutePath, "utf8");
      return JSON.parse(raw) as ScrapeRunSummary;
    } catch {
      return null;
    }
  }

  private async writeJson(relativePath: string, data: unknown) {
    await this.writeFile(relativePath, JSON.stringify(data, null, 2));
  }

  private async writeFile(relativePath: string, data: string) {
    const absolutePath = path.join(this.rootDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, data, "utf8");
  }

  private async writeBuffer(relativePath: string, data: Buffer) {
    const absolutePath = path.join(this.rootDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, data);
  }
}
