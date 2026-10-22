import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// The styleguide's own scaffolding: boards, rows of cells with captions, in the preview's shapes
// (design-preview.html §2 and §3). Only the guide's tokens are used.

/** A titled part ("Foundations", "Components"): a section heading (guide §4) over a sentence. */
export function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-16 scroll-mt-24">
      <h2 id={`${id}-h`} className="text-section-phone leading-tight font-medium tracking-heading text-ink md:text-section">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PartIntro({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 mb-5 max-w-[820px] text-small text-ink-muted">{children}</p>;
}

/** One component and its states, in a bordered board. `id` is what the index at the top links to. */
export function Board({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="mt-4 scroll-mt-24 rounded-[12px] border border-line bg-paper p-5 md:p-7"
    >
      <h3 id={`${id}-h`} className="text-[15px] font-semibold">
        {title}
      </h3>
      {note ? <p className="mt-1 mb-[18px] max-w-[760px] text-caption text-ink-muted">{note}</p> : <div className="mb-[18px]" />}
      <div className="flex flex-col gap-[22px]">{children}</div>
    </section>
  );
}

/** A wrapping row of cells. */
export function Spec({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-start gap-x-7 gap-y-[18px]", className)}>{children}</div>;
}

/** One state with its caption: a bold name, then what it is for. */
export function Cell({
  name,
  note,
  children,
  className,
}: {
  name: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 max-w-full justify-items-start gap-2", className)}>
      {children}
      <span className="text-micro leading-snug text-ink-muted">
        <b className="font-medium text-ink">{name}</b>
        {note ? <> {note}</> : null}
      </span>
    </div>
  );
}
