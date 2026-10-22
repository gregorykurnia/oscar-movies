import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Guide §7 "Show all" row: a full-width text button on a top rule, the bold part in ink 500 and the
 * rest ink-muted ("**Show all 21** · sorted by % chance"). Hover underlines the bold part.
 */
export function ShowAllRow({
  label,
  rest,
  className,
  ...link
}: Omit<ComponentProps<typeof Link>, "children"> & {
  /** The bold part, a verb: "Show all 21". */
  label: string;
  /** What follows the dot, if anything. */
  rest?: ReactNode;
}) {
  return (
    <Link
      className={cn(
        "group block w-full border-t border-line py-[22px] text-left text-small text-ink-muted outline-none focus-visible:shadow-focus",
        className,
      )}
      {...link}
    >
      <strong className="font-medium text-ink underline-offset-[3px] group-hover:underline">{label}</strong>
      {rest ? <> · {rest}</> : null}
    </Link>
  );
}
