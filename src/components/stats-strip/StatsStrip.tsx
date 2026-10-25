import Link from "next/link";
import { cn } from "@/lib/cn";

export type Stat = {
  /** The figure ("57%", "23"). */
  value: string;
  /** "of N" or a unit after the value, in ink-muted ("8 of 14"). */
  of?: string;
  label: string;
  /** A line under the label, in ink-muted: the film behind the figure ("Anora: 3 wins at Oscars and BAFTA"). */
  note?: string;
  /** 0–100: a 2px gold meter on a track under the label. */
  meter?: number;
  /** A stat that counts films links to the filtered list. */
  href?: string;
};

/**
 * Guide §7 Stats strip: three equal cells between line rules; stacks on phone. Four (an award
 * page's accuracy figures) stack until desktop, as "100% 138 of 140" doesn't fit a quarter of a tablet.
 */
export function StatsStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  const four = stats.length === 4;
  return (
    <div className={cn("grid grid-cols-1 border-y border-line", four ? "lg:grid-cols-4" : "md:grid-cols-3", className)}>
      {stats.map((stat, i) => {
        const body = (
          <>
            <p className="text-num-l-phone leading-[1.1] font-light tracking-num whitespace-nowrap md:text-num-l">
              {stat.value}
              {stat.of ? <small className="ml-1 text-[16px] tracking-normal text-ink-muted">{stat.of}</small> : null}
            </p>
            <p className="mt-1 text-caption text-ink-muted decoration-current underline-offset-[3px] group-hover:text-ink group-hover:underline">
              {stat.label}
            </p>
            {stat.note ? <p className="mt-0.5 text-caption text-ink-muted">{stat.note}</p> : null}
            {stat.meter !== undefined ? (
              <span aria-hidden="true" className="mt-2.5 block h-0.5 bg-track">
                <span className="block h-0.5 bg-gold" style={{ width: `${Math.min(100, Math.max(0, stat.meter))}%` }} />
              </span>
            ) : null}
          </>
        );
        const cell = four
          ? cn("py-3.5 lg:pt-[18px] lg:pr-6 lg:pb-5", i > 0 && "border-t border-line lg:border-t-0 lg:border-l lg:pl-6")
          : cn("py-3.5 md:pt-[18px] md:pr-6 md:pb-5", i > 0 && "border-t border-line md:border-t-0 md:border-l md:pl-6");
        return stat.href ? (
          <Link
            key={stat.label}
            href={stat.href}
            className={cn(cell, "group block outline-none focus-visible:shadow-focus")}
          >
            {body}
          </Link>
        ) : (
          <div key={stat.label} className={cell}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
