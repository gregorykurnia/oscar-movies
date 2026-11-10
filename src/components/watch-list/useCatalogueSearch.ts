"use client";

import { useEffect, useRef, useState } from "react";
import { type CataloguePage, type CatalogueResult } from "@/lib/movie-catalogue/contract";

/** An explicit opening searches immediately; subsequent edits wait 300ms. Old replies never win. */
export function useCatalogueSearch(text: string, enabled: boolean) {
  const query = text.trim();
  const [request, setRequest] = useState({ page: 1, retry: 0 });
  const [found, setFound] = useState<{ query: string; value: CataloguePage } | null>(null);
  const [failure, setFailure] = useState<{ query: string; message: string; retry: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [skeleton, setSkeleton] = useState(false);
  const previous = useRef({ enabled: false, query: "", retry: 0 });
  const current = found?.query === query ? found.value : null;
  const error = failure?.query === query ? failure : null;

  useEffect(() => {
    const before = previous.current;
    previous.current = { enabled, query, retry: request.retry };
    if (!enabled || !query) return;
    const controller = new AbortController();
    const sameQuery = before.enabled && before.query === query;
    const page = sameQuery ? request.page : 1;
    const delay = sameQuery || !before.enabled ? 0 : 300;
    const skeletonTimer = setTimeout(() => setSkeleton(true), delay + 300);
    const timer = setTimeout(async () => {
      setBusy(true);
      setFailure(null);
      try {
        if (!navigator.onLine) throw new Error("offline");
        const response = await fetch(`/api/movie-catalogue?${new URLSearchParams({ q: query, page: String(page) })}`, { signal: controller.signal });
        const result = await response.json() as CatalogueResult<CataloguePage>;
        if (controller.signal.aborted) return;
        if (!result.ok) {
          const access = result.error === "refused" || result.error === "unavailable";
          const message = access ? "Film search isn't working. TMDB refused the app's access, so it needs a fix on the server. You can still add the film manually."
            : result.error === "rate-limited" ? "Too many searches for now. TMDB asks the app to wait a minute. Try again then, or add the film manually."
            : result.error === "invalid-input" ? "Type a film title of up to 200 characters, or add it manually."
            : "Couldn't reach TMDB. Check the connection and try again, or add the film manually.";
          setFailure({ query, message, retry: !access && result.error !== "invalid-input" });
        } else {
          setFound((old) => ({ query, value: {
            ...result.value,
            films: page > 1 && old?.query === query
              ? [...old.value.films, ...result.value.films.filter((film) => !old.value.films.some((item) => item.tmdbId === film.tmdbId))]
              : result.value.films,
          } }));
        }
      } catch {
        if (!controller.signal.aborted) setFailure({ query, message: "Couldn't reach TMDB. Check the connection and try again, or add the film manually.", retry: true });
      } finally {
        if (!controller.signal.aborted) {
          clearTimeout(skeletonTimer);
          setBusy(false);
          setSkeleton(false);
        }
      }
    }, delay);
    return () => { clearTimeout(timer); clearTimeout(skeletonTimer); controller.abort(); };
  }, [query, enabled, request]);

  return {
    query, films: current?.films ?? [], error,
    busy: enabled && !!query && (busy || (!current && !error)), skeleton,
    nextPage: current?.nextPage ?? null,
    more: () => setRequest((old) => ({ page: current?.nextPage ?? 1, retry: old.retry + 1 })),
    retry: () => setRequest((old) => ({ page: current?.page ?? 1, retry: old.retry + 1 })),
  };
}
