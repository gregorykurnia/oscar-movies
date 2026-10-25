"use client";

import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { buttonClasses } from "@/components/button/Button";
import { cn } from "@/lib/cn";

export type SortLink = { label: string; href: string; current: boolean; /** One line under the label. */ caption?: string };

/**
 * The year grid's sort button (guide §7 Sort menu, §8.4): a small secondary button "Sort: Oscars"
 * that opens a menu of the sorts, each a link (`menuitemradio`), so the sort stays in the address. Arrow keys move, Esc (from
 * the button or a link) closes and returns focus to the button, as does choosing a sort; a press
 * outside or tabbing away closes it.
 */
export function SortMenu({ items, className }: { items: SortLink[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const popId = useId();
  const currentIndex = Math.max(0, items.findIndex((i) => i.current));
  const current = items[currentIndex];

  // Opening puts focus on the current sort.
  useEffect(() => {
    if (open) linkRefs.current[currentIndex]?.focus();
    // Only when it opens; arrow keys move focus themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    const at = linkRefs.current.findIndex((el) => el === document.activeElement);
    const focus = (i: number) => linkRefs.current[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      case "ArrowDown":
        e.preventDefault();
        focus(at + 1);
        return;
      case "ArrowUp":
        e.preventDefault();
        focus(at - 1);
        return;
      case "Home":
        e.preventDefault();
        focus(0);
        return;
      case "End":
        e.preventDefault();
        focus(items.length - 1);
        return;
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (open && !rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen(!open)}
        className={buttonClasses({ variant: "secondary", size: "sm", className: open ? "!border-ink" : undefined })}
      >
        <ArrowUpDown aria-hidden="true" strokeWidth={1.75} className="text-ink-muted" />
        Sort: {current?.label}
        <ChevronDown aria-hidden="true" strokeWidth={1.75} className="text-ink-muted" />
      </button>
      {open ? (
        <div
          id={popId}
          role="menu"
          aria-labelledby={`${popId}-label`}
          className="absolute top-full left-0 z-20 mt-2 w-[248px] animate-pop rounded-lg bg-surface p-2 shadow-pop md:right-0 md:left-auto"
        >
          <div id={`${popId}-label`} className="px-2.5 pt-1 pb-1.5 text-micro text-ink-muted">
            Sort the films by
          </div>
          {items.map((item, i) => (
            <Link
              key={item.href}
              ref={(el) => {
                linkRefs.current[i] = el;
              }}
              href={item.href}
              scroll={false}
              role="menuitemradio"
              aria-checked={item.current}
              onClick={() => {
                buttonRef.current?.focus();
                setOpen(false);
              }}
              className={cn(
                "grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-small text-ink outline-none",
                "transition-colors duration-[var(--dur-fast)] ease-app hover:bg-track focus-visible:bg-track focus-visible:shadow-focus",
                item.current && "bg-gold-wash font-medium text-gold-ink hover:bg-gold-wash",
              )}
            >
              <span>
                {item.label}
                {item.caption ? (
                  <span className="block text-caption font-normal text-ink-muted">{item.caption}</span>
                ) : null}
              </span>
              {item.current ? <Check aria-hidden="true" className="size-4" strokeWidth={1.75} /> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
