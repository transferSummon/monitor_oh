import { existsSync } from "node:fs";
import path from "node:path";

import { config as loadDotenv } from "dotenv";

let envLoaded = false;

export function loadLocalEnv() {
  if (envLoaded) return;

  const rootDir = process.env.INIT_CWD || process.cwd();

  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.resolve(rootDir, fileName);

    if (existsSync(filePath)) {
      loadDotenv({ path: filePath, override: false });
    }
  }

  envLoaded = true;
}
