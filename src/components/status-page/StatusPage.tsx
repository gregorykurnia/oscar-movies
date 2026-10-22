import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header/PageHeader";
import { cn } from "@/lib/cn";

/**
 * Guide §8.11 Not found and error: an eyebrow line, the Display title, one sentence, the actions,
 * then either three useful links (404) or a reference line (errors). Sits inside AppShell.
 */
export function StatusPage({
  eyebrow,
  title,
  sub,
  actions,
  links,
  detail,
  headingLevel,
  className,
}: {
  /** "Error 404" or "Something went wrong". */
  eyebrow: string;
  title: string;
  sub: string;
  /** The primary button first, then the secondary. */
  actions: ReactNode;
  /** The 404's three links. */
  links?: StatusLink[];
  /** The error's "Reference: 7f3a9c · 22 Oct 2026, 08:14". */
  detail?: ReactNode;
  /** 1 on the real pages; 2 for the styleguide's samples. */
  headingLevel?: 1 | 2;
  className?: string;
}) {
  return (
    <div className={cn("pt-6 pb-12", className)}>
      <p className="mb-3 text-caption text-ink-muted">{eyebrow}</p>
      <PageHeader title={title} sub={sub} headingLevel={headingLevel} />
      <div className="mt-8 flex flex-wrap gap-2">{actions}</div>
      {links ? (
        <nav
          aria-label="Useful pages"
          className="mt-10 grid grid-cols-1 gap-4 border-t border-line pt-6 md:grid-cols-3"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-xs text-small outline-none focus-visible:shadow-focus"
            >
              <span className="group-hover:underline group-hover:underline-offset-[3px]">{link.label}</span>
              <span className="block text-caption text-ink-muted">{link.caption}</span>
            </Link>
          ))}
        </nav>
      ) : null}
      {detail ? <p className="mt-6 text-caption text-ink-muted">{detail}</p> : null}
    </div>
  );
}

export type StatusLink = { label: string; caption: string; href: string };

/**
 * The 404's three links: the live race, this year's awards, the watch list. Without `season` the
 * labels carry no year; without `toWatch` the watch list's caption has no count (the 404 is a
 * server page and the count lives in the marks on the client).
 */
export function usefulLinks({ season, toWatch }: { season?: number; toWatch?: number } = {}): StatusLink[] {
  return [
    {
      label: season ? `The ${season} race` : "The race",
      caption: "Live season",
      href: "/",
    },
    {
      label: season ? `Awards ${season - 1}` : "Awards",
      caption: "Every award and festival",
      href: "/awards",
    },
    {
      label: "Watch list",
      caption: toWatch === undefined ? "Films you want to watch" : `${toWatch} to watch`,
      href: "/watch-list",
    },
  ];
}
