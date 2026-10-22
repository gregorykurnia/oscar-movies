import { Check } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Guide §7 Filter chip: a 32px pill toggle. On: gold wash, gold-ink 500, with a check.
 * The toolbar that owns it keeps the filter in the address.
 */
export function Chip({
  pressed,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-caption whitespace-nowrap outline-none",
        "transition-[background-color,border-color,color] duration-[var(--dur-fast)] ease-app focus-visible:shadow-focus",
        pressed
          ? "border-transparent bg-gold-wash font-medium text-gold-ink"
          : "border-line bg-surface text-ink hover:border-line-strong",
        className,
      )}
      {...rest}
    >
      {pressed ? <Check aria-hidden="true" className="size-3.5" strokeWidth={1.75} /> : null}
      {children}
    </button>
  );
}
