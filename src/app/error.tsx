"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ErrorPage } from "@/components/status-page/ErrorPage";
import { formatDate } from "@/lib/format";

// "22 Oct 2026, 08:14" on the visitor's own clock, taken once per error. formatDate reads UTC
// fields, so the date is shifted by the zone's offset first.
const stamps = new WeakMap<object, string>();
function stampFor(error: object): string {
  let stamp = stamps.get(error);
  if (!stamp) {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    stamp = `${formatDate(local, true)}, ${clock}`;
    stamps.set(error, stamp);
  }
  return stamp;
}
const subscribe = () => () => {};

/** The page-level error boundary (guide §8.11). It renders inside the root layout's AppShell. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // No time on the server, so its HTML never disagrees with the browser's clock.
  const time = useSyncExternalStore(
    subscribe,
    () => stampFor(error),
    () => undefined,
  );
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorPage onRetry={retry} reference={error.digest} time={time} />;
}
