import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

interface CsvRow {
  [key: string]: string;
}

export interface DestinationSeedRow {
  id: number;
  name: string;
  country: string;
  slug: string;
  parentId: number | null;
  destinationType: string;
  isOlympic: boolean;
  sortOrder: number | null;
}

export interface KeywordSeedRow {
  id: number;
  keyword: string;
  destinationId: number | null;
  competitorId: number | null;
}

const fallbackDestinations: DestinationSeedRow[] = [
  { id: 1, name: "Canary Islands", country: "Spain", slug: "canary-islands", parentId: null, destinationType: "island_group", isOlympic: true, sortOrder: 30 },
  { id: 2, name: "Mallorca", country: "Spain", slug: "mallorca", parentId: null, destinationType: "island", isOlympic: false, sortOrder: null },
  { id: 3, name: "Costa del Sol", country: "Spain", slug: "costa-del-sol", parentId: null, destinationType: "region", isOlympic: false, sortOrder: null },
  { id: 4, name: "Cyprus", country: "Cyprus", slug: "cyprus", parentId: null, destinationType: "country", isOlympic: true, sortOrder: 50 },
  { id: 5, name: "Greece", country: "Greece", slug: "greece", parentId: null, destinationType: "country", isOlympic: true, sortOrder: 100 },
  { id: 6, name: "Crete", country: "Greece", slug: "crete", parentId: 5, destinationType: "island", isOlympic: true, sortOrder: 110 },
  { id: 7, name: "Corfu", country: "Greece", slug: "corfu", parentId: 5, destinationType: "island", isOlympic: true, sortOrder: 109 },
  { id: 8, name: "Zante", country: "Greece", slug: "zante", parentId: 5, destinationType: "island", isOlympic: true, sortOrder: 150 },
  { id: 9, name: "Kefalonia", country: "Greece", slug: "kefalonia", parentId: 5, destinationType: "island", isOlympic: true, sortOrder: 119 },
  { id: 10, name: "Skopelos", country: "Greece", slug: "skopelos", parentId: 5, destinationType: "island", isOlympic: true, sortOrder: 142 },
  { id: 11, name: "Antalya", country: "Turkey", slug: "antalya", parentId: null, destinationType: "region", isOlympic: false, sortOrder: null },
  { id: 12, name: "Algarve", country: "Portugal", slug: "algarve", parentId: null, destinationType: "region", isOlympic: false, sortOrder: null },
];

const fallbackKeywords: KeywordSeedRow[] = [
  "canary islands:canary,canaries,tenerife,lanzarote,fuerteventura,gran canaria",
  "mallorca:mallorca,majorca,palma",
  "costa del sol:costa del sol,malaga,marbella,torremolinos",
  "cyprus:cyprus,paphos,larnaca,protaras,limassol",
  "crete:crete,chania,heraklion,rethymnon",
  "corfu:corfu",
  "zante:zakynthos,zante",
  "kefalonia:kefalonia",
  "skopelos:skopelos",
  "antalya:antalya,turkey,belek,side,kemer",
  "algarve:algarve,faro,albufeira",
  "greece:greek islands,greece",
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

const olympicTopLevelSortOrder = new Map<string, number>(
  [
    ["albania", 10],
    ["balearic-islands", 20],
    ["canary-islands", 30],
    ["croatia", 40],
    ["cyprus", 50],
    ["egypt", 60],
    ["greece", 100],
    ["india", 160],
    ["malta", 170],
    ["portugal", 180],
    ["spain", 190],
    ["the-gambia", 200],
    ["turkey", 210],
  ] as const,
);

const greekChildDestinations = [
  ["Aegina", "aegina", "island", 101],
  ["Agistri", "agistri", "island", 102],
  ["Alonissos", "alonissos", "island", 103],
  ["Andros", "andros", "island", 104],
  ["Antipaxos", "antipaxos", "island", 105],
  ["Astypalaia", "astypalaia", "island", 106],
  ["Athens", "athens", "city", 107],
  ["Athens Riviera", "athens-riviera", "region", 108],
  ["Corfu", "corfu", "island", 109],
  ["Crete", "crete", "island", 110],
  ["Evia", "evia", "island", 111],
  ["Halki", "halki", "island", 112],
  ["Halkidiki", "halkidiki", "region", 113],
  ["Hydra", "hydra", "island", 114],
  ["Ios", "ios", "island", 115],
  ["Ithaca", "ithaca", "island", 116],
  ["Kalymnos", "kalymnos", "island", 117],
  ["Karpathos", "karpathos", "island", 118],
  ["Kefalonia", "kefalonia", "island", 119],
  ["Kos", "kos", "island", 120],
  ["Lefkada", "lefkada", "island", 121],
  ["Leros", "leros", "island", 122],
  ["Milos", "milos", "island", 123],
  ["Mykonos", "mykonos", "island", 124],
  ["Naxos", "naxos", "island", 125],
  ["North Peloponnese", "north-peloponnese", "region", 126],
  ["Olympus Riviera", "olympus-riviera", "region", 127],
  ["Parga", "parga", "region", 128],
  ["Paros", "paros", "island", 129],
  ["Patmos", "patmos", "island", 130],
  ["Paxos", "paxos", "island", 131],
  ["Pelion Peninsula", "pelion-peninsula", "region", 132],
  ["Peloponnese", "peloponnese", "region", 133],
  ["Poros", "poros", "island", 134],
  ["Preveza", "preveza", "region", 135],
  ["Rhodes", "rhodes", "island", 136],
  ["Samos", "samos", "island", 137],
  ["Santorini", "santorini", "island", 138],
  ["Sifnos", "sifnos", "island", 139],
  ["Sivota", "sivota", "region", 140],
  ["Skiathos", "skiathos", "island", 141],
  ["Skopelos", "skopelos", "island", 142],
  ["Spetses", "spetses", "island", 143],
  ["Symi", "symi", "island", 144],
  ["Syros", "syros", "island", 145],
  ["Thassos", "thassos", "island", 146],
  ["Thessaloniki", "thessaloniki", "city", 147],
  ["Tilos", "tilos", "island", 148],
  ["Tinos", "tinos", "island", 149],
  ["Zante", "zante", "island", 150],
] as const;

const greekKeywordAliases: Array<readonly [string, string]> = [
  ["crete", "crete"], ["chania", "crete"], ["heraklion", "crete"], ["rethymno", "crete"], ["rethymnon", "crete"],
  ["corfu", "corfu"], ["rhodes", "rhodes"], ["lindos", "rhodes"], ["faliraki", "rhodes"], ["ixia", "rhodes"],
  ["kos", "kos"], ["kardamena", "kos"], ["tigaki", "kos"],
  ["zante", "zante"], ["zakynthos", "zante"], ["tsilivi", "zante"], ["laganas", "zante"],
  ["kefalonia", "kefalonia"], ["cephalonia", "kefalonia"], ["skopelos", "skopelos"],
  ["skiathos", "skiathos"], ["santorini", "santorini"], ["thira", "santorini"],
  ["mykonos", "mykonos"], ["naxos", "naxos"], ["paros", "paros"], ["paxos", "paxos"],
  ["lefkada", "lefkada"], ["lefkas", "lefkada"], ["samos", "samos"], ["halkidiki", "halkidiki"],
  ["parga", "parga"], ["preveza", "preveza"], ["athens", "athens"], ["athens riviera", "athens-riviera"],
  ["thessaloniki", "thessaloniki"], ["peloponnese", "peloponnese"], ["north peloponnese", "north-peloponnese"],
  ["sivota", "sivota"], ["syvota", "sivota"], ["pelion", "pelion-peninsula"], ["pelion peninsula", "pelion-peninsula"],
  ["aegina", "aegina"], ["agistri", "agistri"], ["alonissos", "alonissos"], ["andros", "andros"],
  ["antipaxos", "antipaxos"], ["astypalaia", "astypalaia"], ["evia", "evia"], ["halki", "halki"],
  ["hydra", "hydra"], ["ios", "ios"], ["ithaca", "ithaca"], ["kalymnos", "kalymnos"],
  ["karpathos", "karpathos"], ["leros", "leros"], ["milos", "milos"], ["patmos", "patmos"],
  ["poros", "poros"], ["sifnos", "sifnos"], ["spetses", "spetses"], ["symi", "symi"],
  ["syros", "syros"], ["thassos", "thassos"], ["tilos", "tilos"], ["tinos", "tinos"],
  ["crete holidays", "crete"], ["corfu holidays", "corfu"], ["rhodes holidays", "rhodes"],
  ["kos holidays", "kos"], ["zante holidays", "zante"], ["santorini holidays", "santorini"],
  ["mykonos holidays", "mykonos"], ["skiathos holidays", "skiathos"],
] as const;

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

function toBoolean(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true" || normalized === "t" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "f" || normalized === "0" || normalized === "no") return false;
  return null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hydrateDestinations(rows: DestinationSeedRow[]) {
  const destinations = rows.map((row) => {
    const slug = row.slug || slugify(row.name);
    const topLevelSortOrder = olympicTopLevelSortOrder.get(slug);

    return {
      ...row,
      slug,
      destinationType: row.destinationType || "country",
      isOlympic: row.isOlympic || (row.parentId === null && topLevelSortOrder !== undefined),
      sortOrder: row.sortOrder ?? topLevelSortOrder ?? null,
    };
  });

  const byCountrySlug = new Map(destinations.map((destination) => [`${destination.country}:${destination.slug}`, destination]));
  let nextId = Math.max(0, ...destinations.map((destination) => destination.id)) + 1;
  let greece = byCountrySlug.get("Greece:greece");

  if (!greece) {
    greece = {
      id: nextId,
      name: "Greece",
      country: "Greece",
      slug: "greece",
      parentId: null,
      destinationType: "country",
      isOlympic: true,
      sortOrder: olympicTopLevelSortOrder.get("greece") ?? 100,
    };
    nextId += 1;
    destinations.push(greece);
    byCountrySlug.set("Greece:greece", greece);
  } else {
    greece.parentId = null;
    greece.destinationType = "country";
    greece.isOlympic = true;
    greece.sortOrder = greece.sortOrder ?? olympicTopLevelSortOrder.get("greece") ?? 100;
  }

  for (const [name, slug, destinationType, sortOrder] of greekChildDestinations) {
    const key = `Greece:${slug}`;
    const existing = byCountrySlug.get(key);

    if (existing) {
      existing.name = name;
      existing.parentId = greece.id;
      existing.destinationType = destinationType;
      existing.isOlympic = true;
      existing.sortOrder = sortOrder;
      continue;
    }

    const destination = {
      id: nextId,
      name,
      country: "Greece",
      slug,
      parentId: greece.id,
      destinationType,
      isOlympic: true,
      sortOrder,
    };
    nextId += 1;
    destinations.push(destination);
    byCountrySlug.set(key, destination);
  }

  return destinations;
}

function hydrateKeywords(rows: KeywordSeedRow[]) {
  const destinations = loadDestinationSeed();
  const byGreekSlug = new Map(
    destinations
      .filter((destination) => destination.country === "Greece")
      .map((destination) => [destination.slug, destination]),
  );
  const greece = byGreekSlug.get("greece");
  const aliasToDestination = new Map(greekKeywordAliases);
  const keywords = rows.map((row) => {
    const destSlug = aliasToDestination.get(row.keyword.trim().toLowerCase());
    const destination = destSlug ? byGreekSlug.get(destSlug) : null;

    if (destination && greece && row.destinationId === greece.id) {
      return {
        ...row,
        destinationId: destination.id,
      };
    }

    return row;
  });
  const existingKeys = new Set(
    keywords.map((row) => `${row.keyword.trim().toLowerCase()}:${row.destinationId ?? ""}:${row.competitorId ?? ""}`),
  );
  let nextId = Math.max(0, ...keywords.map((row) => row.id)) + 1;

  for (const [keyword, destSlug] of greekKeywordAliases) {
    const destination = byGreekSlug.get(destSlug);
    if (!destination) continue;

    const key = `${keyword.toLowerCase()}:${destination.id}:`;
    if (existingKeys.has(key)) continue;

    keywords.push({
      id: nextId,
      keyword,
      destinationId: destination.id,
      competitorId: null,
    });
    existingKeys.add(key);
    nextId += 1;
  }

  return keywords;
}

export function loadDestinationSeed(): DestinationSeedRow[] {
  const rows = parseCsvFile("railway.csv");
  if (rows.length === 0) {
    return hydrateDestinations(fallbackDestinations);
  }

  const parsed = rows
    .map((row) => ({
      id: toInt(row.id) ?? 0,
      name: row.name?.trim() || "",
      country: row.country?.trim() || "",
      slug: row.slug?.trim() || "",
      parentId: toInt(row.parent_id),
      destinationType: row.destination_type?.trim() || "",
      isOlympic: toBoolean(row.is_olympic) ?? false,
      sortOrder: toInt(row.sort_order),
    }))
    .filter((row) => row.id > 0 && row.name && row.country);

  return hydrateDestinations(parsed);
}

export function loadKeywordSeed(): KeywordSeedRow[] {
  const rows = parseCsvFile("railwayKeywords.csv");
  if (rows.length === 0) {
    return hydrateKeywords(fallbackKeywords);
  }

  const parsed = rows
    .map((row) => ({
      id: toInt(row.id) ?? 0,
      keyword: row.keyword?.trim() || "",
      destinationId: toInt(row.destination_id),
      competitorId: toInt(row.competitor_id),
    }))
    .filter((row) => row.id > 0 && row.keyword);

  return hydrateKeywords(parsed);
}
