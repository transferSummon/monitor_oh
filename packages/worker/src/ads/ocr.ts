import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

import { createWorker } from "tesseract.js";

let workerPromise: Promise<any> | null = null;

function getCachePath(key: string) {
  const fileName = `${createHash("sha1").update(key).digest("hex")}.json`;
  const rootDir = process.env.INIT_CWD || process.cwd();
  return path.resolve(rootDir, "tmp", "ads-ocr-cache", fileName);
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }

  return workerPromise;
}

export async function extractTextFromImage(imageUrl: string, cacheKey: string) {
  const cachePath = getCachePath(cacheKey);

  if (existsSync(cachePath)) {
    const cached = JSON.parse(await fs.readFile(cachePath, "utf8")) as { text?: string | null };
    return cached.text ?? null;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Image fetch failed with HTTP ${response.status}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const worker = await getWorker();
  const result = await worker.recognize(buffer);
  const text = typeof result?.data?.text === "string" ? result.data.text.trim() : "";

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify({ text: text || null }, null, 2), "utf8");

  return text || null;
}

export async function shutdownOcr() {
  if (!workerPromise) return;

  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = null;
}
