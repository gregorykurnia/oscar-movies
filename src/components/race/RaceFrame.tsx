import Link from "next/link";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/empty-state/EmptyState";

export const RACE_CATEGORIES = [
  { slug: "picture", name: "Picture" },
  { slug: "documentary", name: "Documentary" },
  { slug: "international", name: "International" },
  { slug: "animated", name: "Animated" },
] as const;

export type RaceCategory = (typeof RACE_CATEGORIES)[number]["slug"];

/** The category in the address (`?category=`); anything unknown is Picture. */
export function parseCategory(value: string | string[] | undefined): RaceCategory {
  const slug = Array.isArray(value) ? value[0] : value;
  return RACE_CATEGORIES.find((c) => c.slug === slug)?.slug ?? "picture";
}

/**
 * Guide §8.1 / §8.12 "Nothing yet": the race tabs, the stage line and the empty state. A
 * placeholder frame until the data layer and chances arrive (1.6, 3.x): every tab reads
 * "No contenders yet".
 */
export function RaceFrame({ category, filmCount }: { category: RaceCategory; filmCount: number }) {
  return (
    <>
      <nav
        aria-label="Category"
        className={cn(
          "-mx-4 mt-7 flex gap-[22px] overflow-x-auto border-b border-line px-4 [scrollbar-width:none]",
          "md:mx-0 md:mt-12 md:grid md:grid-cols-4 md:gap-0 md:overflow-visible md:px-0",
        )}
      >
        {RACE_CATEGORIES.map(({ slug, name }) => {
          const current = slug === category;
          return (
            <Link
              key={slug}
              href={slug === "picture" ? "/" : `/?category=${slug}`}
              aria-current={current ? "page" : undefined}
              className={cn(
                "group relative min-w-0 flex-none rounded-xs pb-3 text-left outline-none focus-visible:shadow-focus md:pr-6 md:pb-[18px]",
                current &&
                  "after:absolute after:right-0 after:-bottom-px after:left-0 after:h-0.5 after:bg-gold md:after:right-6",
              )}
            >
              <span
                className={cn(
                  "block text-section-phone leading-tight font-medium tracking-heading transition-colors duration-[var(--dur-fast)] ease-app md:text-section",
                  current ? "text-ink" : "text-ink-subtle group-hover:text-ink-muted",
                )}
              >
                {name}
              </span>
              <span className={cn("mt-1.5 hidden truncate text-caption md:block", current ? "font-medium text-ink" : "text-ink-muted")}>
                No contenders yet
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-[18px] flex items-center gap-4 text-caption text-ink-muted md:mt-7 md:text-small">
        <span className="flex items-start gap-2.5 md:items-center">
          <span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full bg-gold shadow-[0_0_0_4px_var(--gold-wash)] md:mt-0" />
          <span>
            <strong className="font-medium text-ink">Eligible list in Dec</strong> · Nominations Jan
          </span>
        </span>
      </div>

      <EmptyState title="No contenders yet" className="mt-7">
        The first precursor results arrive in December, starting with the Annie Award nominations.
      </EmptyState>

      <p className="mt-6 text-caption text-ink-muted">
        {filmCount === 1 ? "1 film is" : `${filmCount.toLocaleString("en-US")} films are`} loaded so far.
      </p>
    </>
  );
}
