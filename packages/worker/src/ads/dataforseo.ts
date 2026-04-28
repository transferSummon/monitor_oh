import type { DataForSeoAdsSearchItem } from "./types";

interface DataForSeoTaskResult<T> {
  status_code: number;
  status_message: string;
  result?: Array<{
    items_count?: number;
    items?: T[];
  }>;
}

interface DataForSeoResponse<T> {
  status_code: number;
  status_message: string;
  tasks?: DataForSeoTaskResult<T>[];
}

function getAuthHeader() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error("Missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD.");
  }

  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

export async function fetchGoogleAdsByTarget({
  target,
  locationName,
  platform,
  depth,
}: {
  target: string;
  locationName: string;
  platform: string;
  depth: number;
}) {
  const response = await fetch("https://api.dataforseo.com/v3/serp/google/ads_search/live/advanced", {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        location_name: locationName,
        platform,
        target,
        depth,
      },
    ]),
  });

  const payload = (await response.json()) as DataForSeoResponse<DataForSeoAdsSearchItem>;

  if (!response.ok) {
    throw new Error(`DataForSEO request failed with HTTP ${response.status}.`);
  }

  if (payload.status_code !== 20000) {
    throw new Error(`DataForSEO returned ${payload.status_code}: ${payload.status_message}`);
  }

  const task = payload.tasks?.[0];

  if (!task) {
    throw new Error("DataForSEO returned no task payload.");
  }

  if (task.status_code === 40102) {
    return {
      status: "no_results" as const,
      message: task.status_message,
      items: [] as DataForSeoAdsSearchItem[],
    };
  }

  if (task.status_code !== 20000) {
    throw new Error(`DataForSEO task failed with ${task.status_code}: ${task.status_message}`);
  }

  return {
    status: "success" as const,
    message: task.status_message,
    items: task.result?.[0]?.items ?? [],
  };
}
