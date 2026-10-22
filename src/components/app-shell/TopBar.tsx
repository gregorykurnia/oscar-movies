"use client";

import { Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";
import { currentNav, NAV_ITEMS } from "./nav";
import { PhoneMenu } from "./PhoneMenu";
import { Wordmark } from "./Wordmark";

/**
 * Guide §6.1 Top bar: wordmark, main nav and search. Compact (≤1100px): the search box becomes
 * an icon button. Phone (≤760px): menu button, wordmark, search button.
 * Search is inert until task 1.12 wires SearchCommand into the box and the buttons.
 */
export function TopBar({ season, toWatch }: { season?: number; toWatch?: number }) {
  const pathname = usePathname() ?? "/";
  const current = currentNav(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <header className="relative z-30 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-[var(--content-max)] items-center gap-1.5 pr-4 pl-1.5 md:h-16 md:gap-8 md:px-8">
        <IconButton
          ref={menuButtonRef}
          aria-label="Menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? "phone-menu" : undefined}
          onClick={() => setMenuOpen(true)}
          className="md:hidden"
        >
          <Menu aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
        <Wordmark />
        <nav aria-label="Main" className="hidden gap-[18px] text-small text-ink-muted md:flex xl:gap-[22px]">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === current ? "page" : undefined}
              className={cn(
                "rounded-xs py-1 whitespace-nowrap outline-none transition-colors duration-[var(--dur-fast)] ease-app",
                "hover:text-ink focus-visible:shadow-focus",
                item.key === current && "font-medium text-ink",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {/* The search box (desktop) and the search button (compact and phone). Inert until 1.12. */}
        <button
          type="button"
          disabled
          aria-label="Search films and awards"
          className="ml-auto hidden h-[38px] w-[260px] items-center gap-2 rounded-[9px] border border-line bg-paper pr-2.5 pl-3 text-small text-ink-muted xl:flex"
        >
          <Search aria-hidden="true" className="size-4 flex-none" strokeWidth={1.75} />
          <span className="flex-1 truncate text-left">Search films and awards</span>
          <kbd className="rounded-[5px] border border-line bg-surface px-1.5 text-micro leading-[18px] text-ink-muted">/</kbd>
        </button>
        <IconButton aria-label="Search" disabled className="-mr-1.5 ml-auto md:mr-0 xl:hidden">
          <Search aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
      </div>
      <PhoneMenu
        open={menuOpen}
        onClose={closeMenu}
        current={current}
        returnFocusTo={menuButtonRef}
        season={season}
        toWatch={toWatch}
      />
    </header>
  );
}
