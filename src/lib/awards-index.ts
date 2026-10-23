// What the awards index and the festivals index say about each award (guide §8.7): the caption
// under its name, its date or pill, and the Oscars' line. Pure; the pages read the registry and
// the year's editions and pass them in.
import type { AwardEdition } from "@/data/awards";
import { AWARDS, type AwardKind, type AwardSummary } from "@/lib/awards";
import { DASH, formatDate, formatMonthYear } from "@/lib/format";
import { RACE_CATEGORIES } from "@/lib/race";

/** A row's state: its edition loaded, partly loaded, or not loaded at all ("No data"). */
export type IndexState = "loaded" | "partial" | "no-data";

export function editionState(edition: AwardEdition | undefined): IndexState {
  if (!edition || edition.status === "no_data") return "no-data";
  return edition.status === "partial" ? "partial" : "loaded";
}

/** The Oscar categories an award's prizes count towards, in the race's words and order: "Picture, International"; all four: "All four categories". */
export function givesLabel(award: AwardSummary): string {
  if (award.oscarCategories.length === RACE_CATEGORIES.length) return "All four categories";
  return RACE_CATEGORIES.filter((c) => award.oscarCategories.includes(c.slug))
    .map((c) => c.name)
    .join(", ");
}

/** The database's day ("2026-01-11") as a date, read in UTC like the rest of the app. */
function dayOf(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** A row's date: a major's winners' day ("11 Jan 2026"), a festival's month ("Jan 2026"), since festivals run over days; "–" when unknown. */
export function rowDate(kind: AwardKind, winnersOn: string | null): string {
  if (!winnersOn) return DASH;
  return kind === "festival" ? formatMonthYear(dayOf(winnersOn)) : formatDate(dayOf(winnersOn), true);
}

/** The awards of one kind, in calendar order. */
export function awardsOfKind(kind: AwardKind): AwardSummary[] {
  return AWARDS.filter((a) => a.kind === kind).sort((a, b) => a.calendarOrder - b.calendarOrder);
}

/** The Oscars' line on the awards index: the ceremony's day, then the Best Picture winner once there is one. */
export function oscarsLine(winnersOn: string | null, pictureWinner: string | null): string {
  const date = winnersOn ? formatDate(dayOf(winnersOn), true) : null;
  return [date, pictureWinner ? `${pictureWinner} won Best Picture` : null].filter(Boolean).join(" · ");
}
