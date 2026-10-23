import { cn } from "@/lib/cn";
import { formatChance } from "@/lib/race-chances";

/**
 * Guide §6.5 / §1: the chance to win as a large light numeral (XL: 46px, 34px on phone) with the
 * % raised and muted; the leader's number and % in gold-ink. `p` is 0–1.
 */
export function Pct({ p, leader = false, className }: { p: number; leader?: boolean; className?: string }) {
  return (
    <span
      data-leader={leader || undefined}
      className={cn(
        "inline-block text-num-xl-phone leading-none font-light tracking-num whitespace-nowrap tabular-nums md:text-num-xl",
        leader ? "text-gold-ink" : "text-ink",
        className,
      )}
    >
      {formatChance(p)}
      <sup
        className={cn(
          "relative top-0.5 ml-0.5 align-top text-[15px] tracking-normal md:top-1 md:text-[20px]",
          leader ? "text-gold-ink" : "text-ink-muted",
        )}
      >
        %
      </sup>
    </span>
  );
}
