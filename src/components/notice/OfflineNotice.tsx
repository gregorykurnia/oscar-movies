"use client";

import { useOnline } from "@/lib/use-online";
import { Notice } from "./Notice";

/** Guide §8 states: the error notice under the PageHeader while there's no connection. */
export function OfflineNotice({ className }: { className?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <Notice tone="error" title="You're offline." role="status" className={className}>
      Showing the page as last loaded. Marks can&apos;t be saved until you&apos;re back.
    </Notice>
  );
}
