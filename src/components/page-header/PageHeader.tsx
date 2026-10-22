import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { HistoryBackLink } from "./HistoryBackLink";

export type BackLink = {
  /** Names where it goes ("Awards 2024"); "Back" on the movie page. */
  label: string;
  href: string;
  /** Go back in the browser's history when the visit came from this app (the movie page); else follow href. */
  history?: boolean;
};

export const backLinkClasses =
  "mb-3 inline-flex items-center gap-1.5 rounded-xs text-small text-ink-muted outline-none " +
  "transition-colors duration-[var(--dur-fast)] ease-app hover:text-ink focus-visible:shadow-focus md:mb-4 [&_svg]:size-4";

/**
 * Guide §6.2 PageHeader: every page starts with it. Optional back link, the page's one h1 in
 * Display, a sub line in ink-muted, and actions at the right (the year switcher).
 */
export function PageHeader({
  title,
  sub,
  back,
  actions,
  headingLevel = 1,
  className,
}: {
  title: ReactNode;
  sub?: ReactNode;
  back?: BackLink;
  actions?: ReactNode;
  /** 1 on every page; 2 only for the styleguide's samples, which sit under the page's own h1. */
  headingLevel?: 1 | 2;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  return (
    <header className={cn("flex items-start justify-between gap-4 md:items-end md:gap-6", className)}>
      <div className="min-w-0">
        {back ? (
          back.history ? (
            <HistoryBackLink href={back.href} className={backLinkClasses}>
              <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
              {back.label}
            </HistoryBackLink>
          ) : (
            <Link href={back.href} className={backLinkClasses}>
              <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
              {back.label}
            </Link>
          )
        ) : null}
        <Heading className="text-display-phone leading-tight font-semibold tracking-display [overflow-wrap:anywhere] md:text-display">
          {title}
        </Heading>
        {sub ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-body-phone text-ink-muted md:mt-2.5 md:text-body">
            {sub}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-none gap-2">{actions}</div> : null}
    </header>
  );
}
