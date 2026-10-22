import type { ReactNode } from "react";
import { Toaster } from "@/components/toast/Toaster";
import { Footer } from "./Footer";
import { TopBar } from "./TopBar";

/**
 * Guide §6.1 AppShell: top bar, the page in <main>, footer. Every page renders inside it
 * (the root layout does this) and starts with PageHeader.
 */
export function AppShell({
  children,
  season,
  toWatch,
}: {
  children: ReactNode;
  /** The live season's year, for the phone menu's "2026 season". */
  season?: number;
  /** Films on the want-to-watch list, for the phone menu's "4 to watch". */
  toWatch?: number;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar season={season} toWatch={toWatch} />
      <main className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 pt-7 pb-16 text-body-phone md:px-8 md:pt-14 md:pb-24 md:text-body">
        {children}
      </main>
      <Footer />
      {/* Failure toasts (a mark that didn't save), bottom right. */}
      <Toaster />
    </div>
  );
}
