export const COMPETITORS = [
  {
    slug: "jet2-holidays",
    name: "Jet2 Holidays",
    siteUrl: "https://www.jet2holidays.com/",
  },
  {
    slug: "easyjet-holidays",
    name: "easyJet Holidays",
    siteUrl: "https://www.easyjet.com/en/holidays",
  },
  {
    slug: "tui",
    name: "TUI",
    siteUrl: "https://www.tui.co.uk/",
  },
  {
    slug: "sunvil",
    name: "Sunvil",
    siteUrl: "https://www.sunvil.co.uk/",
  },
  {
    slug: "ionian-island-holidays",
    name: "Ionian Island Holidays",
    siteUrl: "https://www.ionianislandholidays.com/",
  },
  {
    slug: "loveholidays",
    name: "loveholidays",
    siteUrl: "https://www.loveholidays.com/",
  },
] as const;

export type Competitor = (typeof COMPETITORS)[number];
export type CompetitorSlug = Competitor["slug"];

export function getCompetitor(slug: CompetitorSlug) {
  const competitor = COMPETITORS.find((entry) => entry.slug === slug);

  if (!competitor) {
    throw new Error(`Unknown competitor: ${slug}`);
  }

  return competitor;
}
