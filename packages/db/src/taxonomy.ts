import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

interface CsvRow {
  [key: string]: string;
}

export interface DestinationSeedRow {
  id: number;
  name: string;
  country: string;
}

export interface KeywordSeedRow {
  id: number;
  keyword: string;
  destinationId: number | null;
  competitorId: number | null;
}

const fallbackDestinations: DestinationSeedRow[] = [
  { id: 1, name: "Canary Islands", country: "Spain" },
  { id: 2, name: "Mallorca", country: "Spain" },
  { id: 3, name: "Costa del Sol", country: "Spain" },
  { id: 4, name: "Cyprus", country: "Cyprus" },
  { id: 5, name: "Crete", country: "Greece" },
  { id: 6, name: "Corfu", country: "Greece" },
  { id: 7, name: "Zakynthos", country: "Greece" },
  { id: 8, name: "Kefalonia", country: "Greece" },
  { id: 9, name: "Skopelos", country: "Greece" },
  { id: 10, name: "Antalya", country: "Turkey" },
  { id: 11, name: "Algarve", country: "Portugal" },
  { id: 12, name: "Greek Islands", country: "Greece" },
];

const fallbackKeywords: KeywordSeedRow[] = [
  "canary islands:canary,canaries,tenerife,lanzarote,fuerteventura,gran canaria",
  "mallorca:mallorca,majorca,palma",
  "costa del sol:costa del sol,malaga,marbella,torremolinos",
  "cyprus:cyprus,paphos,larnaca,protaras,limassol",
  "crete:crete,chania,heraklion,rethymnon",
  "corfu:corfu",
  "zakynthos:zakynthos,zante",
  "kefalonia:kefalonia",
  "skopelos:skopelos",
  "antalya:antalya,turkey,belek,side,kemer",
  "algarve:algarve,faro,albufeira",
  "greek islands:greek islands,greece",
].flatMap((entry, index) => {
  const [name, keywords] = entry.split(":");
  const destination = fallbackDestinations.find((item) => item.name.toLowerCase() === name);

  return (keywords ?? "")
    .split(",")
    .filter(Boolean)
    .map((keyword) => ({
      id: index * 10 + keyword.length,
      keyword,
      destinationId: destination?.id ?? null,
      competitorId: null,
    }));
});

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      const next = line[index + 1];
      if (insideQuotes && next === "\"") {
        current += "\"";
        index += 1;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsvFile(fileName: string) {
  const rootDir = process.env.INIT_CWD || process.cwd();
  const filePath = path.resolve(rootDir, fileName);
  if (!existsSync(filePath)) {
    return [];
  }

  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });

    return row;
  });
}

function toInt(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function loadDestinationSeed(): DestinationSeedRow[] {
  const rows = parseCsvFile("railway.csv");
  if (rows.length === 0) {
    return fallbackDestinations;
  }

  return rows
    .map((row) => ({
      id: toInt(row.id) ?? 0,
      name: row.name?.trim() || "",
      country: row.country?.trim() || "",
    }))
    .filter((row) => row.id > 0 && row.name && row.country);
}

export function loadKeywordSeed(): KeywordSeedRow[] {
  const rows = parseCsvFile("railwayKeywords.csv");
  if (rows.length === 0) {
    return fallbackKeywords;
  }

  return rows
    .map((row) => ({
      id: toInt(row.id) ?? 0,
      keyword: row.keyword?.trim() || "",
      destinationId: toInt(row.destination_id),
      competitorId: toInt(row.competitor_id),
    }))
    .filter((row) => row.id > 0 && row.keyword);
}
