"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

type FilterItem = { label: string; href: string; current: boolean; caption?: string; separated?: boolean };

/** Guide §7 Filter menu: address links, keyboard navigation and a viewport-safe popover. */
export function FilterMenu({ label, caption, choice, active, items }: {
  label: string;
  caption: string;
  choice: string;
  active: boolean;
  items: FilterItem[];
}) {
  const [open, setOpen] = useState(false);
  const [menuLeft, setMenuLeft] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const id = useId();
  const current = Math.max(0, items.findIndex((item) => item.current));

  const positionMenu = useCallback(() => {
    const trigger = button.current?.getBoundingClientRect();
    if (!trigger) return;
    const width = Math.min(248, window.innerWidth - 32);
    const desired = trigger.left + width > window.innerWidth - 16 ? trigger.right - width : trigger.left;
    const left = Math.max(16, Math.min(desired, window.innerWidth - 16 - width));
    setMenuLeft(left - trigger.left);
  }, []);

  useEffect(() => {
    if (!open) return;
    links.current[current]?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", positionMenu);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", positionMenu);
    };
  }, [open, current, positionMenu]);

  function close() {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        positionMenu();
        setOpen(true);
      }
      return;
    }
    const at = links.current.findIndex((link) => link === document.activeElement);
    const next = event.key === "ArrowDown" ? (at + 1) % items.length
      : event.key === "ArrowUp" ? (at - 1 + items.length) % items.length
      : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (next !== null) {
      event.preventDefault();
      links.current[next]?.focus();
    }
  }

  return (
    <div ref={root} className="relative max-w-full" onKeyDown={onKeyDown} onBlur={(event) => {
      if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button ref={button} type="button" aria-label={`${label}: ${choice}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => { if (!open) positionMenu(); setOpen(!open); }}
        className={cn(
          "relative inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-[9px] border py-1 pr-2.5 pl-3 text-caption outline-none before:absolute before:inset-x-0 before:-inset-y-1.5 hover:border-line-strong focus-visible:shadow-focus",
          active ? "border-transparent bg-gold-wash text-gold-ink" : "border-line bg-surface text-ink-muted",
          open && (active ? "shadow-[inset_0_0_0_1px_var(--gold-ink)]" : "border-ink"),
        )}>
        <span>{label}:</span><span className={cn("min-w-0 font-medium [overflow-wrap:anywhere]", active ? "text-gold-ink" : "text-ink")}>{choice}</span>
        <ChevronDown aria-hidden="true" className={cn("size-3.5 flex-none", active ? "text-gold-ink" : "text-ink-subtle")} strokeWidth={1.75} />
      </button>
      {open ? (
        <div id={id} role="menu" aria-labelledby={`${id}-label`}
          style={{ left: menuLeft }}
          className="absolute z-20 mt-2 max-h-[336px] w-[248px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg bg-surface p-2 shadow-pop animate-pop">
          <div id={`${id}-label`} className="px-2.5 pt-1 pb-1.5 text-micro text-ink-muted">{caption}</div>
          {items.map((item, index) => (
            <div key={item.href} className={item.separated ? "mt-1 border-t border-line pt-1" : undefined}>
              <Link ref={(element) => { links.current[index] = element; }} href={item.href} scroll={false}
                role="menuitemradio" aria-checked={item.current} onClick={close}
                className={cn(
                  "grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-small outline-none focus-visible:shadow-focus",
                  item.current ? "bg-gold-wash font-medium text-gold-ink hover:bg-gold-wash" : "text-ink hover:bg-track focus-visible:bg-track",
                )}>
                <span className="[overflow-wrap:anywhere]">{item.label}{item.caption ? <> <span className="block text-caption font-normal text-ink-muted">{item.caption}</span></> : null}</span>
                {item.current ? <Check aria-hidden="true" className="size-4" strokeWidth={1.75} /> : null}
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
