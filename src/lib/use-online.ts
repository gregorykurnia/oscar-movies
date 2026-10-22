"use client";

import { useSyncExternalStore } from "react";

// `navigator.onLine`, kept current by the browser's online and offline events (plan §5.6).
// The server render and the first client render assume online.

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
