import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type TextLinkProps = ComponentProps<typeof Link> & {
  /** "gold" inside the gold wash (the "why"): gold-ink text on a gold-soft underline. */
  tone?: "ink" | "gold";
};

// Guide §7 Text link: 1px underline in line-strong, offset 3px; hover turns it the text colour.
const tones = {
  ink: "text-ink decoration-line-strong",
  gold: "text-gold-ink decoration-gold-soft",
};

export function TextLink({ tone = "ink", className, ...rest }: TextLinkProps) {
  return (
    <Link
      className={cn(
        "rounded-xs underline decoration-1 underline-offset-[3px] outline-none hover:decoration-current focus-visible:shadow-focus",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
