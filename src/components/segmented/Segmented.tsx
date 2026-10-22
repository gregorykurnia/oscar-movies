import Link from "next/link";
import { cn } from "@/lib/cn";

export type SegmentedItem = { label: string; href: string; current?: boolean };

/**
 * Guide §7 Segmented control: the category on non-race pages, and sort. Each item is a link,
 * so the view stays in the address. Scrolls sideways on phone.
 */
export function Segmented({
  items,
  label,
  className,
}: {
  items: SegmentedItem[];
  /** Accessible name of the group ("Category", "Sort by"). */
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "inline-flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-track p-[3px] [scrollbar-width:none]",
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-small whitespace-nowrap outline-none",
            "transition-colors duration-[var(--dur-fast)] ease-app focus-visible:shadow-focus",
            item.current ? "bg-surface font-medium text-ink shadow-hairline" : "text-ink-muted hover:text-ink",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
