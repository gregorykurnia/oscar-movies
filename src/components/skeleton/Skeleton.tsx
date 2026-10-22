import { cn } from "@/lib/cn";

/** One placeholder block in track with a slow shimmer (none with reduced motion). Size it with className. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-[4px] bg-[linear-gradient(90deg,var(--track)_0%,var(--paper)_50%,var(--track)_100%)] bg-size-[200%_100%] animate-shimmer",
        "motion-reduce:animate-none motion-reduce:bg-track",
        className,
      )}
    />
  );
}

/**
 * The busy region skeletons sit in (guide §13). It stays invisible for the first 300ms, so a
 * fast load never flashes placeholders (guide §7).
 */
export function SkeletonRegion({
  label,
  children,
  className,
}: {
  /** "Loading contenders" */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div aria-busy="true" aria-label={label} className={cn("opacity-0 animate-appear", className)}>
      {children}
    </div>
  );
}

const widths = [
  ["w-[46%]", "w-[70%]"],
  ["w-[30%]", "w-[58%]"],
  ["w-[38%]", "w-[64%]"],
];

/** Race contender rows in their own shape: title, precursor and scores lines, %, marks. */
export function RaceRowsSkeleton({ rows = 3, label = "Loading contenders" }: { rows?: number; label?: string }) {
  return (
    <SkeletonRegion label={label}>
      {Array.from({ length: rows }, (_, i) => {
        const [title, line] = widths[i % widths.length];
        return (
          <div
            key={i}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_64px] items-center gap-x-3 gap-y-2 border-t py-7",
              "md:grid-cols-[minmax(0,1fr)_112px_200px_84px] md:gap-0",
              i === 0 ? "border-ink" : "border-line",
            )}
          >
            <div>
              <Skeleton className={cn("h-5", title)} />
              <Skeleton className={cn("mt-3 h-3", line)} />
              <Skeleton className="mt-2.5 h-2.5 w-[38%]" />
            </div>
            <Skeleton className="hidden h-4 w-9 justify-self-end md:block" />
            <Skeleton className="h-[38px] w-16 justify-self-end" />
            <Skeleton className="hidden h-9 w-[78px] justify-self-end rounded-[18px] md:block" />
          </div>
        );
      })}
    </SkeletonRegion>
  );
}
