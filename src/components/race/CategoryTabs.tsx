"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { parseCategory, RACE_CATEGORIES, type RaceCategory } from "@/lib/race";

const scrollButton = "absolute top-0 bottom-px z-10 grid w-11 place-items-center bg-paper text-ink-muted md:hidden";

/**
 * Guide §6.3 Race tabs: four equal columns, each the category name with its lead under it; a
 * 2px gold line under the selected one. Phone: names only, in a row that scrolls sideways.
 * Arrow keys, Home and End move between the tabs and select them. Every panel is rendered on the
 * server, so a tab switches at once; the category is kept in the address (`?category=`, replaced
 * rather than pushed, so Back leaves the race) and read back from it, so a reload keeps it.
 */
export function CategoryTabs({
  leads,
  panels,
}: {
  /** Under each name, desktop only: the leader, or a count. */
  leads: Record<RaceCategory, ReactNode>;
  panels: Record<RaceCategory, ReactNode>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = parseCategory(searchParams.get("category"));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const id = useId();

  // Keep a selected tab clear of the edge controls when its category or the viewport changes.
  useEffect(() => {
    const list = listRef.current;
    const tab = tabRefs.current[RACE_CATEGORIES.findIndex((c) => c.slug === selected)];
    if (!list || !tab) return;

    const measureOverflow = () => {
      const left = list.scrollLeft > 1;
      const right = list.scrollWidth - list.clientWidth - list.scrollLeft > 1;
      setOverflow((before) => before.left === left && before.right === right ? before : { left, right });
    };
    const revealSelected = () => {
      if (list.scrollWidth > list.clientWidth) {
        const leftGutter = 56;
        const rightGutter = 48;
        const tabEnd = tab.offsetLeft + tab.offsetWidth;
        if (tabEnd > list.scrollLeft + list.clientWidth - rightGutter) {
          list.scrollLeft = tabEnd - list.clientWidth + rightGutter;
        } else if (tab.offsetLeft < list.scrollLeft + leftGutter) {
          list.scrollLeft = tab.offsetLeft - leftGutter;
        }
      }
      measureOverflow();
    };

    revealSelected();
    list.addEventListener("scroll", measureOverflow, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(revealSelected);
    observer?.observe(list);
    observer?.observe(tab);
    return () => {
      list.removeEventListener("scroll", measureOverflow);
      observer?.disconnect();
    };
  }, [selected]);

  function scrollCategories(toEnd: boolean) {
    const list = listRef.current;
    if (list) list.scrollLeft = toEnd ? list.scrollWidth : 0;
  }

  function select(category: RaceCategory) {
    const params = new URLSearchParams(searchParams.toString());
    if (category === "picture") params.delete("category");
    else params.set("category", category);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = RACE_CATEGORIES.findIndex((c) => c.slug === selected);
    const last = RACE_CATEGORIES.length - 1;
    const to =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (to === null) return;
    e.preventDefault();
    select(RACE_CATEGORIES[to].slug);
    tabRefs.current[to]?.focus();
  }

  return (
    <>
      <div className="relative -mx-4 mt-7 md:mx-0 md:mt-12">
        <div
          ref={listRef}
          role="tablist"
          aria-label="Category"
          onKeyDown={onKeyDown}
          className={cn(
            "relative flex gap-3 overflow-x-auto border-b border-line px-4 [scrollbar-width:none]",
            "md:grid md:grid-cols-4 md:gap-0 md:overflow-visible md:px-0",
          )}
        >
          {RACE_CATEGORIES.map(({ slug, name }, i) => {
            const current = slug === selected;
            return (
              <button
                key={slug}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${slug}`}
                aria-selected={current}
                aria-controls={`${id}-panel-${slug}`}
                tabIndex={current ? 0 : -1}
                onClick={() => select(slug)}
                className={cn(
                  "group relative min-w-0 flex-none rounded-xs pb-3 text-left outline-none focus-visible:shadow-focus max-md:min-h-11 md:pr-6 md:pb-[18px]",
                  current &&
                    "after:absolute after:right-0 after:-bottom-px after:left-0 after:h-0.5 after:bg-gold md:after:right-6",
                )}
              >
                <span
                  className={cn(
                    "block text-section-phone leading-tight font-medium tracking-heading transition-colors duration-[var(--dur-fast)] ease-app md:text-section",
                    // ink-subtle is for text of 24px and up (guide §3), so the 20px phone size uses ink-muted.
                    current
                      ? "text-ink"
                      : "text-ink-muted group-hover:text-ink md:text-ink-subtle md:group-hover:text-ink-muted",
                  )}
                >
                  {name}
                </span>
                <span
                  className={cn(
                    "mt-1.5 hidden items-center gap-[7px] overflow-hidden text-caption whitespace-nowrap md:flex",
                    current ? "text-ink [&_[data-lead-text]]:font-medium" : "text-ink-muted [&_[role=img]]:opacity-75",
                  )}
                >
                  <span className="sr-only">, </span>
                  {leads[slug]}
                </span>
              </button>
            );
          })}
        </div>
        {overflow.left ? (
          <button type="button" tabIndex={-1} aria-label="Scroll categories left" onClick={() => scrollCategories(false)}
            className={cn(scrollButton, "left-0 after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-3 after:bg-linear-to-r after:from-paper after:from-75% after:to-transparent")}>
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
        ) : null}
        {overflow.right ? (
          <button type="button" tabIndex={-1} aria-label="Scroll categories right" onClick={() => scrollCategories(true)}
            className={cn(scrollButton, "right-0 before:pointer-events-none before:absolute before:inset-y-0 before:right-full before:w-2 before:bg-linear-to-l before:from-paper before:to-transparent")}>
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        ) : null}
      </div>
      {RACE_CATEGORIES.map(({ slug }) => (
        <div
          key={slug}
          role="tabpanel"
          id={`${id}-panel-${slug}`}
          aria-labelledby={`${id}-tab-${slug}`}
          hidden={slug !== selected}
        >
          {panels[slug]}
        </div>
      ))}
    </>
  );
}
