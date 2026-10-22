"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

const COLUMNS = 3;

/**
 * Guide §7 Year switcher: a button with the year and a chevron that opens a 264px popover with
 * the film years in a 3-column grid, newest first. Arrow keys move, Enter picks, Esc closes and
 * returns focus to the button. Picking a year changes it in the address.
 */
export function YearSwitcher({
  year,
  years,
  liveYear,
  href,
  className,
}: {
  /** The page's year (gold wash). */
  year: number;
  /** Newest first; see yearRange in lib/years. */
  years: number[];
  /** The live season, marked with a gold dot. */
  liveYear?: number;
  /** The address for a year, with "{year}" in it ("/grid/{year}"), or a function of the year (client callers). */
  href: string | ((year: number) => string);
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, years.indexOf(year)));
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const yearRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const popId = useId();
  const hrefFor = (y: number) => (typeof href === "function" ? href(y) : href.replaceAll("{year}", String(y)));

  // Opening puts keyboard focus on the page's year.
  useEffect(() => {
    if (open) yearRefs.current[active]?.focus();
    // Only when it opens; arrow keys move focus themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A press outside closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function toggle() {
    if (!open) setActive(Math.max(0, years.indexOf(year)));
    setOpen(!open);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  // A move off the grid's edge does nothing (Up from the top row stays put).
  function move(to: number) {
    if (to < 0 || to >= years.length) return;
    setActive(to);
    yearRefs.current[to]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close(true);
        return;
      case "ArrowRight":
        e.preventDefault();
        move(active + 1);
        return;
      case "ArrowLeft":
        e.preventDefault();
        move(active - 1);
        return;
      case "ArrowDown":
        e.preventDefault();
        move(active + COLUMNS);
        return;
      case "ArrowUp":
        e.preventDefault();
        move(active - COLUMNS);
        return;
      case "Home":
        e.preventDefault();
        move(0);
        return;
      case "End":
        e.preventDefault();
        move(years.length - 1);
        return;
      case "Enter": {
        e.preventDefault();
        const picked = years[active];
        close(true);
        if (picked !== year) router.push(hrefFor(picked));
        return;
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onBlur={(e) => {
        // Tabbing out of the popover closes it.
        if (open && !rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`Year: ${year}`}
        onClick={toggle}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-[9px] border bg-surface pr-2 pl-2.5 font-medium whitespace-nowrap text-ink outline-none md:h-10 md:pr-3 md:pl-3.5",
          "transition-colors duration-[var(--dur-fast)] ease-app focus-visible:shadow-focus",
          open ? "border-ink" : "border-line hover:border-line-strong",
        )}
      >
        {year}
        <ChevronDown aria-hidden="true" className="size-4 text-ink-muted" strokeWidth={1.75} />
      </button>
      {open ? (
        <div
          id={popId}
          role="dialog"
          aria-label="Choose a year"
          onKeyDown={onKeyDown}
          className="absolute top-full right-0 z-20 mt-2 w-[264px] animate-pop rounded-lg bg-surface p-2.5 shadow-pop"
        >
          <p className="px-1.5 pt-1 pb-2 text-micro text-ink-muted">Film year (Oscars the following March)</p>
          <div className="grid grid-cols-3 gap-1">
            {years.map((y, i) => (
              <Link
                key={y}
                ref={(el) => {
                  yearRefs.current[i] = el;
                }}
                href={hrefFor(y)}
                tabIndex={i === active ? 0 : -1}
                aria-current={y === year ? "page" : undefined}
                onFocus={() => setActive(i)}
                onClick={() => close(false)}
                className={cn(
                  "relative grid h-10 place-items-center rounded-[8px] text-small outline-none",
                  "transition-colors duration-[var(--dur-fast)] ease-app focus-visible:shadow-focus",
                  y === year ? "bg-gold-wash font-medium text-gold-ink" : "text-ink hover:bg-track focus-visible:bg-track",
                )}
              >
                {y}
                {y === liveYear ? (
                  <>
                    <span aria-hidden="true" title="Live season" className="absolute top-[7px] right-[9px] size-1.5 rounded-full bg-gold" />
                    <span className="sr-only">, live season</span>
                  </>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
