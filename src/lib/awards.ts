// The award registry as the app reads it (`data/awards.json`, the file the loader writes to the
// database): names and kinds for headers, links and the build's list of award pages. Results,
// categories' Oscar mapping and accuracy come from the database (`src/data/awards.ts`).
import registry from "../../data/awards.json";
import type { OscarCategory } from "@/data/oscars";

export type AwardKind = "oscars" | "major" | "festival" | "critics";

export type AwardSummary = {
  slug: string;
  name: string;
  shortName: string;
  kind: AwardKind;
  /** The season's order; the awards index lists each section by it (guide §8.7). */
  calendarOrder: number;
  winnersOnly: boolean;
  isSelection: boolean;
  /** The Oscar categories its prizes count towards, each once. */
  oscarCategories: OscarCategory[];
};

export const AWARDS: AwardSummary[] = registry.map((a) => ({
  slug: a.slug,
  name: a.name,
  shortName: a.shortName,
  kind: a.kind as AwardKind,
  calendarOrder: a.calendarOrder,
  winnersOnly: a.winnersOnly,
  isSelection: a.isSelection,
  oscarCategories: [...new Set(a.categories.map((c) => c.oscarCategory as OscarCategory))],
}));

/** An award by its address segment, or undefined when there is none. */
export function findAward(slug: string): AwardSummary | undefined {
  return AWARDS.find((a) => a.slug === slug);
}

const KIND_LABEL: Record<AwardKind, string> = {
  oscars: "Academy Awards",
  major: "Major award",
  festival: "Festival prize",
  critics: "Critics group",
};

/** What sort of award it is, for the page's sub line. */
export function kindLabel(kind: AwardKind): string {
  return KIND_LABEL[kind];
}
