"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/**
 * The movie page's "Back" (guide §6.2): the browser's back when the visit came from this app,
 * otherwise a plain link to href (the race). Modified clicks (new tab) keep the link.
 */
export function HistoryBackLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    let fromHere = false;
    try {
      fromHere = document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
    } catch {
      fromHere = false;
    }
    if (fromHere && window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  }

  return (
    <Link href={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
