import { cn } from "@/lib/cn";
import { DASH, formatDate, formatScore } from "@/lib/format";

type Tile = { value: number | null; updatedAt: Date | null };

export type ScoreTilesData = {
  imdb: Tile;
  rt: Tile;
  mc: Tile;
  tmdb: Tile;
  average: number | null;
  count: number;
};

const SOURCES = [
  { key: "imdb", label: "IMDb", unit: "/10", decimals: 1 },
  { key: "rt", label: "Rotten Tomatoes", unit: "%", decimals: 0 },
  { key: "mc", label: "Metacritic", unit: "/100", decimals: 0 },
  { key: "tmdb", label: "TMDB", unit: "/10", decimals: 1 },
] as const;

const tile = "px-4 pt-3.5 pb-4 md:px-5 md:pt-[18px] md:pb-5";
const value =
  "mt-1.5 text-num-l-phone leading-[1.1] font-light tracking-num md:text-num-l";
const unit = "ml-0.5 text-[15px] tracking-[0] text-ink-muted";

/**
 * Guide §7 Score tiles (movie page): four sources and the average in one bordered strip.
 * Phone: 2×2 with the average full width. A missing score is "–" with "No score yet".
 */
export function ScoreTiles({
  scores,
  now = new Date(),
  className,
}: {
  scores: ScoreTilesData;
  /** Dates from this year leave the year out (guide §11). */
  now?: Date;
  className?: string;
}) {
  const sameYear = (d: Date) => d.getUTCFullYear() === now.getUTCFullYear();
  const hasAverage = scores.count > 0 && scores.average !== null;
  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[repeat(4,1fr)_1.25fr]",
        // Rules between tiles: a 2×2 grid on phone, one row on desktop.
        "[&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t [&>*]:border-line",
        "md:[&>*:nth-child(n+2)]:border-l md:[&>*:nth-child(n+3)]:border-t-0",
        className,
      )}
    >
      {SOURCES.map((s) => {
        const t = scores[s.key];
        const missing = t.value === null;
        return (
          <div key={s.key} className={tile} data-missing={missing || undefined}>
            <div className="text-caption text-ink-muted">{s.label}</div>
            <div className={cn(value, missing && "text-ink-muted")}>
              {missing ? DASH : formatScore(t.value, s.decimals)}
              {missing ? null : <small className={unit}>{s.unit}</small>}
            </div>
            <div className="mt-1.5 text-micro text-ink-muted">
              {missing
                ? "No score yet"
                : t.updatedAt
                  ? `Updated ${formatDate(t.updatedAt, !sameYear(t.updatedAt))}`
                  : null}
            </div>
          </div>
        );
      })}
      <div className={cn(tile, "col-span-2 !border-l-0 bg-gold-wash md:col-span-1 md:!border-l")}>
        <div className="text-caption text-ink-muted">Average</div>
        <div className={cn(value, hasAverage ? "text-gold-ink" : "text-ink-muted")}>
          {hasAverage ? formatScore(scores.average, 0) : DASH}
        </div>
        <div className="mt-1.5 text-micro text-ink-muted">
          {hasAverage ? `${scores.count} of 4 scores` : "No scores yet"}
        </div>
      </div>
    </div>
  );
}
