"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { useWantCount } from "@/components/marks/MarksProvider";
import { IconButton } from "./IconButton";
import { NAV_ITEMS, type NavKey } from "./nav";
import { Wordmark } from "./Wordmark";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Guide §6.1 Phone menu: a full-screen sheet that slides down over a scrim. Esc and the close
 * button shut it; focus starts on the close button, is trapped inside, and goes back to the
 * menu button when it closes.
 */
export function PhoneMenu({
  open,
  onClose,
  current,
  returnFocusTo,
  season,
  toWatch,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  current: NavKey | null;
  /** The menu button: focus goes back to it when the menu closes. */
  returnFocusTo: RefObject<HTMLElement | null>;
  /** The live season's year, shown under Race ("2026 season"). */
  season?: number;
  /** Films on the want-to-watch list, shown under Watch list ("4 to watch"). */
  toWatch?: number;
  /** The search button: closes the menu and opens the search sheet. */
  onSearch: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wantCount = useWantCount();

  useEffect(() => {
    if (!open) return;
    const returnTo = returnFocusTo.current;
    closeRef.current?.focus();
    // The page behind doesn't scroll while the sheet covers it.
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    // Widening past the phone layout leaves the menu behind: close it.
    const desktop = window.matchMedia?.("(min-width: 761px)");
    const onWide = (e: MediaQueryListEvent) => e.matches && onClose();
    desktop?.addEventListener("change", onWide);
    return () => {
      root.style.overflow = overflow;
      desktop?.removeEventListener("change", onWide);
      returnTo?.focus();
    };
  }, [open, onClose, returnFocusTo]);

  if (!open) return null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !sheetRef.current) return;
    const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !sheetRef.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !sheetRef.current.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  const watchCaption = toWatch ?? wantCount;
  const captions: Partial<Record<NavKey, string>> = {
    race: season !== undefined ? `${season} season` : undefined,
    "watch-list": watchCaption !== undefined ? `${watchCaption.toLocaleString("en-US")} to watch` : undefined,
  };

  return (
    <div className="md:hidden">
      <div aria-hidden="true" className="fixed inset-0 z-40 animate-fade bg-scrim" onClick={onClose} />
      <div
        ref={sheetRef}
        id="phone-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onKeyDown={onKeyDown}
        className="fixed inset-x-0 top-0 z-50 flex h-dvh animate-sheet flex-col overflow-y-auto bg-surface"
      >
        <div className="flex h-14 flex-none items-center gap-1.5 border-b border-line pr-4 pl-1.5">
          <IconButton ref={closeRef} aria-label="Close menu" onClick={onClose}>
            <X aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
          <Wordmark onClick={onClose} />
          <IconButton aria-label="Search" onClick={onSearch} className="-mr-1.5 ml-auto">
            <Search aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
        </div>
        <nav aria-label="Main" className="py-3">
          {NAV_ITEMS.map((item) => {
            const isCurrent = item.key === current;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "relative flex h-14 items-center justify-between px-4 text-section-phone font-medium tracking-heading outline-none focus-visible:shadow-focus",
                  isCurrent
                    ? "text-ink before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-[2px] before:bg-gold before:content-['']"
                    : "text-ink-muted",
                )}
              >
                {item.label}
                {captions[item.key] ? (
                  <span className="text-caption font-normal tracking-normal text-ink-muted">{captions[item.key]}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-2.5 border-t border-line px-4 pt-4 pb-6 text-small text-ink-muted">
          <Link
            href="/data"
            onClick={onClose}
            className="justify-self-start rounded-xs text-ink underline decoration-line-strong decoration-1 underline-offset-[3px] outline-none hover:decoration-current focus-visible:shadow-focus"
          >
            Data coverage and sources
          </Link>
          <span>Tap the name at the top to go back to the race.</span>
        </div>
      </div>
    </div>
  );
}
