import type { CompetitorAdapter } from "../core/types";

import { easyJetHolidaysAdapter } from "./easyjet-holidays";
import { ionianIslandHolidaysAdapter } from "./ionian-island-holidays";
import { jet2HolidaysAdapter } from "./jet2-holidays";
import { loveholidaysAdapter } from "./loveholidays";
import { sunvilAdapter } from "./sunvil";
import { tuiAdapter } from "./tui";

export const ADAPTERS: CompetitorAdapter[] = [
  sunvilAdapter,
  jet2HolidaysAdapter,
  easyJetHolidaysAdapter,
  tuiAdapter,
  ionianIslandHolidaysAdapter,
  loveholidaysAdapter,
];

export * from "./easyjet-holidays";
export * from "./ionian-island-holidays";
export * from "./jet2-holidays";
export * from "./loveholidays";
export * from "./sunvil";
export * from "./tui";
