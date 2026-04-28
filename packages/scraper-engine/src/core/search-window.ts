import type { SearchWindow } from "./types";

export function buildSearchWindow(now = new Date()): SearchWindow {
  const from = new Date(now);
  from.setDate(from.getDate() + 30);

  const to = new Date(now);
  to.setDate(to.getDate() + 60);

  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
    adults: 2,
    rooms: 1,
    nights: 7,
    timezone: "Europe/London",
  };
}

export function createRunId(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}
