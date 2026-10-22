"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { SearchCommand } from "@/components/search/SearchCommand";
import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";
import { currentNav, NAV_ITEMS } from "./nav";
import { PhoneMenu } from "./PhoneMenu";
import { Wordmark } from "./Wordmark";

/**
 * Guide §6.1 Top bar: wordmark, main nav and search. Compact (≤1100px): the search box becomes
 * an icon button. Phone (≤760px): menu button, wordmark, search button.
 * `SearchCommand` is the box and the buttons; the phone menu's search button opens it too.
 */
export function TopBar({ season, toWatch }: { season?: number; toWatch?: number }) {
  const pathname = usePathname() ?? "/";
  const current = currentNav(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => {
    setMenuOpen(false);
    setSearchOpen(true);
  }, []);

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
        <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
      <PhoneMenu
        open={menuOpen}
        onClose={closeMenu}
        current={current}
        returnFocusTo={menuButtonRef}
        season={season}
        toWatch={toWatch}
        onSearch={openSearch}
      />
    </header>
  );
}
