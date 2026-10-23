import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Guide §8.7 index lists (the preview's `.ilist` and `.feature-link`): one column on phone, two from
// 761px, the first rule in ink. A row is a name with what it gives under it, and a date or a pill at
// its end; a row with a page is a link.

/** A titled part of an index: the heading with its count, then the list. */
export function IndexSection({
  id,
  title,
  count,
  note,
  first = false,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  /** Said after the count, in the same small type ("prizes only before 2025"). */
  note?: string;
  /** Directly under the PageHeader or a feature link, so a smaller gap. */
  first?: boolean;
  children: ReactNode;
}) {
  const caption = [count || null, note].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby={id} className={first ? "mt-10 md:mt-12" : "mt-10 md:mt-14"}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={id}
          className="text-section-phone leading-tight font-medium tracking-heading [overflow-wrap:anywhere] md:text-section"
        >
          {title}
        </h2>
        {caption ? <span className="text-small text-ink-muted">{caption}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function IndexList({ children }: { children: ReactNode }) {
  return <ul className="grid grid-cols-1 border-t border-ink md:grid-cols-2 md:gap-x-10">{children}</ul>;
}

/** One row: `href` makes it a link; without one (no data) it's plain text. */
export function IndexRow({
  href,
  name,
  gives,
  end,
}: {
  href?: string;
  name: string;
  /** What the award gives, under the name. */
  gives?: string;
  /** The date at the row's end, or a pill. */
  end: ReactNode;
}) {
  const body = (
    <>
      <span className="min-w-0">
        <span
          className={cn(
            "block font-medium [overflow-wrap:anywhere]",
            href && "underline-offset-[3px] decoration-line-strong group-hover:underline",
          )}
        >
          {name}
        </span>
        {gives ? <span className="block text-caption text-ink-muted">{gives}</span> : null}
      </span>
      <span className="flex-none text-caption whitespace-nowrap text-ink-muted">{end}</span>
    </>
  );
  return (
    <li className="border-b border-line">
      {href ? (
        <Link
          href={href}
          className="group flex items-center justify-between gap-3 rounded-xs py-3.5 text-small outline-none focus-visible:shadow-focus"
        >
          {body}
        </Link>
      ) : (
        <div className="flex items-center justify-between gap-3 py-3.5 text-small">{body}</div>
      )}
    </li>
  );
}

/** The one link at the top of the awards index (the Oscars): its name, a line under it, and an arrow. */
export function FeatureLink({ href, name, children }: { href: string; name: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface px-6 py-[22px] outline-none hover:border-line-strong focus-visible:shadow-focus max-md:p-4"
    >
      <span className="min-w-0">
        <span className="block text-title font-medium tracking-title max-md:text-title-phone">{name}</span>
        <span className="mt-0.5 block text-small text-ink-muted">{children}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 flex-none text-ink-muted" strokeWidth={1.75} />
    </Link>
  );
}
