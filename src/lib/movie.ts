// Wording for the movie page (guide §8.6, §11): pure, so unit tests cover it.
import type { OscarBox } from "@/data/movie";
import { countryName } from "@/components/flag/Flag";
import { formatDate } from "@/lib/format";
import { editionLabel } from "@/lib/years";

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/** "Portuguese" from an ISO 639-1 code; the code if unknown, null for none. */
export function languageName(code: string | null): string | null {
  if (!code) return null;
  try {
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** The line under the title's flags: "2024 · Brazil, France · Portuguese" (unknown parts left out). */
export function movieFacts(film: { year: number; countries: string[]; language: string | null }): string {
  return [String(film.year), film.countries.map(countryName).join(", "), languageName(film.language)]
    .filter(Boolean)
    .join(" · ");
}

/** The original title, only when it adds something to the English one. */
export function shownOriginalTitle(title: string, originalTitle: string | null): string | null {
  if (!originalTitle) return null;
  return originalTitle.trim().toLowerCase() === title.trim().toLowerCase() ? null : originalTitle;
}

/** The small line under a category in an Oscar result box: the list the film is on. */
export function oscarBoxNote(box: Pick<OscarBox, "outcome" | "country" | "listSize">): string {
  if (box.country) return `Submitted by ${countryName(box.country)}`;
  switch (box.outcome) {
    case "won":
    case "nominated":
    case "runner_up":
      return box.listSize > 0 ? `One of ${box.listSize} nominees` : "Nominee";
    case "shortlisted":
      return box.listSize > 0 ? `One of ${box.listSize} on the shortlist` : "On the shortlist";
    case "eligible":
      return "On the eligible list";
    case "submitted":
      return "Submitted";
  }
}

/** "97th Academy Awards, 2 Mar 2025": the ceremony the boxes belong to; null when they span editions. */
export function oscarsHeading(boxes: Pick<OscarBox, "year" | "winnersOn">[]): string | null {
  const years = new Set(boxes.map((b) => b.year));
  if (years.size !== 1) return null;
  const [first] = boxes;
  const label = editionLabel(first.year);
  return first.winnersOn ? `${label}, ${formatDate(new Date(`${first.winnersOn}T00:00:00Z`), true)}` : label;
}
