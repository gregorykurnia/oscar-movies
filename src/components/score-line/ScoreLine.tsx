import { cn } from "@/lib/cn";
import { DASH, formatLetterboxd, formatScore } from "@/lib/format";

export type Scores = {
  imdb: number | null;
  rt: number | null;
  mc: number | null;
  tmdb: number | null;
  /** Letterboxd's rating (0.5–5). */
  lb: number | null;
  /** The stored average (0–100) and how many of the five scores it uses. */
  average: number | null;
  count: number;
};

/**
 * Guide §7 Scores line: "IMDb 7.9  RT 95  MC 95  TMDB 7.5  Letterboxd 3.8  84 · 5 of 5".
 */
export function ScoreLine({ scores, className }: { scores: Scores; className?: string }) {
  const parts: Array<[string, string]> = [
    ["IMDb", formatScore(scores.imdb, 1)],
    ["RT", formatScore(scores.rt, 0)],
    ["MC", formatScore(scores.mc, 0)],
    ["TMDB", formatScore(scores.tmdb, 1)],
    ["Letterboxd", formatLetterboxd(scores.lb)],
  ];
  const hasAverage = scores.count > 0 && scores.average !== null;
  return (
    <p className={cn("flex flex-wrap gap-x-3 gap-y-0.5 text-micro text-ink-muted md:gap-x-4 md:gap-y-1 md:text-caption", className)}>
      {parts.map(([label, value]) => (
        <span key={label} data-missing={value === DASH || undefined}>
          {label} {value}
        </span>
      ))}
      <span className="font-medium whitespace-nowrap text-ink">
        {hasAverage ? `${formatScore(scores.average, 0)} · ${scores.count} of ${parts.length}` : "No scores yet"}
      </span>
    </p>
  );
}
