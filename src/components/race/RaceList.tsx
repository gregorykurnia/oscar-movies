"use client";

import { createContext, use, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ContenderList } from "./ContenderList";

type WhyState = {
  open: string | null;
  setOpen: (id: string | null) => void;
  buttons: Map<string, HTMLButtonElement>;
};

const WhyContext = createContext<WhyState | null>(null);

function useWhy(): WhyState {
  const ctx = use(WhyContext);
  if (!ctx) throw new Error("WhyButton and WhyRegion go inside a RaceList.");
  return ctx;
}

/**
 * The contender rows of one category (guide §6.5–6.6), with the state they share: which "why" is
 * open (one at a time; Esc closes it and returns focus to its %) and whether "Show all" has
 * shown the rest. The rows themselves are rendered on the server.
 */
export function RaceList({
  rows,
  more = [],
  moreLabel,
  moreRest,
  className,
}: {
  rows: ReactNode[];
  /** Rows kept back until "Show all" (`splitRows`). */
  more?: ReactNode[];
  /** "Show all 38 contenders" */
  moreLabel?: string;
  /** "Bugonia, Train Dreams, The Secret Agent and 33 more under 3%" */
  moreRest?: string;
  className?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [buttons] = useState(() => new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const revealed = useRef(false);
  const hasMore = more.length > 0 && !all;

  // After "Show all", keyboard focus goes to the first row it showed (the button is gone).
  useEffect(() => {
    if (!all || !revealed.current) return;
    revealed.current = false;
    listRef.current?.children[rows.length]?.querySelector<HTMLElement>("h3 a")?.focus();
  }, [all, rows.length]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || open === null || e.defaultPrevented) return;
    e.preventDefault();
    const button = buttons.get(open);
    setOpen(null);
    button?.focus();
  }

  return (
    <WhyContext value={{ open, setOpen, buttons }}>
      <div onKeyDown={onKeyDown} className={className}>
        <ContenderList ref={listRef} className={cn(hasMore && "border-b-0")}>
          {rows}
          {all ? more : null}
        </ContenderList>
        {hasMore ? (
          <button
            type="button"
            onClick={() => {
              revealed.current = true;
              setAll(true);
            }}
            className="group block w-full border-t border-line py-[22px] text-left text-small text-ink-muted outline-none focus-visible:shadow-focus"
          >
            <strong className="font-medium text-ink underline-offset-[3px] group-hover:underline">{moreLabel}</strong>
            {moreRest ? <> · {moreRest}</> : null}
          </button>
        ) : null}
      </div>
    </WhyContext>
  );
}

/**
 * Guide §6.5 To win: the % inside a button that opens its "why" (a 2px underline in line, hover
 * gold-soft, open gold). Opening moves no focus.
 */
export function WhyButton({ id, label, children }: { id: string; /** "41% chance to win, show why" */ label: string; children: ReactNode }) {
  const { open, setOpen, buttons } = useWhy();
  const expanded = open === id;
  return (
    <button
      type="button"
      ref={(el) => {
        if (el) buttons.set(id, el);
        else buttons.delete(id);
      }}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={`${id}-why`}
      onClick={() => setOpen(expanded ? null : id)}
      className={cn(
        // The hit area is at least 44×44 (guide §13) even for a short "8%", without moving the underline.
        "relative inline-block border-b-2 pb-1 outline-none after:absolute after:top-1/2 after:left-1/2 after:size-11 after:min-h-full after:min-w-full after:-translate-x-1/2 after:-translate-y-1/2 transition-colors duration-[var(--dur-fast)] ease-app focus-visible:shadow-focus",
        expanded ? "border-gold" : "border-line hover:border-gold-soft",
      )}
    >
      {children}
    </button>
  );
}

/** Where a row's "why" opens: empty while closed; it opens by height and fades in (200ms). */
export function WhyRegion({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { open } = useWhy();
  return (
    <div id={`${id}-why`} className={className}>
      {open === id ? (
        <div className="grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] duration-[var(--dur)] ease-app starting:grid-rows-[0fr] starting:opacity-0">
          <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
