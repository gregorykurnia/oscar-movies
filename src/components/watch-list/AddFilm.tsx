"use client";

import { AlertCircle, Bookmark, Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { addToWatchList } from "@/app/actions/watch-list";
import { Button } from "@/components/button/Button";
import { useFilmMarkValue } from "@/components/marks/MarksProvider";
import { Highlight, optionClasses, ResultFlag } from "@/components/search/SearchCommand";
import { searchKbd } from "@/components/search/search-styles";
import { Skeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { showToast } from "@/components/toast/Toaster";
import { cn } from "@/lib/cn";
import { matchRange, normalizeQuery, type SearchFilm, type SearchResponse } from "@/lib/search";

// Guide §8.3 "Add a film": a box above the toolbar whose results are the search API's films, any
// year. Typing pauses 300ms before it asks; a slower answer shows two skeleton rows. Enter or a
// tap adds the film at the top of Want to watch (`addToWatchList`), the page refreshes in place
// and a toast confirms. A failed add keeps the text and says so under the box.

const DEBOUNCE_MS = 300;
const TOAST_MS = 4000;

type Found = { query: string; films: SearchFilm[] };

function Spinner() {
  return <span aria-hidden="true" className="size-4 flex-none animate-spin rounded-full border-2 border-gold-ink border-r-transparent" />;
}

/** "On your list" or "Watched", read live from the marks the page shows. */
function ListStatus({ movieId }: { movieId: number }) {
  const { want, watched } = useFilmMarkValue(movieId);
  if (!want && !watched) return null;
  const Icon = want ? Bookmark : Check;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-gold-ink">
      <Icon aria-hidden="true" className={cn("size-3", want && "fill-current")} strokeWidth={1.75} />
      {want ? "On your list" : "Watched"}
    </span>
  );
}

function Option({
  film,
  query,
  id,
  active,
  busy,
  onPick,
}: {
  film: SearchFilm;
  query: string;
  id: string;
  active: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  // A film found by its original title shows that title, so the match isn't a mystery.
  const viaOriginal = matchRange(film.title, query) === null && film.originalTitle !== null;
  const meta = [String(film.year), film.categories.join(", ")].filter(Boolean).join(" · ");
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      // Keep the focus in the box while a row is tapped.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={cn(optionClasses, "cursor-pointer", active && "bg-track")}
    >
      <ResultFlag code={film.flag} />
      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
        <Highlight text={film.title} query={query} />
        <span className="block text-caption font-normal text-ink-muted">
          {viaOriginal ? (
            <>
              <span lang={film.originalLang ?? undefined}>
                <Highlight text={film.originalTitle ?? ""} query={query} />
              </span>
              {" · "}
            </>
          ) : null}
          {meta}
          {" "}
          <ListStatus movieId={film.id} />
        </span>
      </span>
      {busy ? <Spinner /> : film.stage ? <StagePill stage={film.stage} /> : <span />}
    </div>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 pt-6 pb-5 text-center text-small text-ink-muted [overflow-wrap:anywhere]">
      <strong className="mb-1 block font-medium text-ink">{title}</strong>
      {children}
    </div>
  );
}

export function AddFilm() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-option-${i}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState<number | null>(null);
  const [addFailed, setAddFailed] = useState<SearchFilm | null>(null);

  const normalized = normalizeQuery(text);
  const shown = normalized && found ? found : null;
  const fresh = shown !== null && shown.query === normalized;
  const films = shown && !searchFailed ? shown.films : [];
  const activeIndex = films.length > 0 ? Math.min(active, films.length - 1) : -1;
  const open = focused && !dismissed && normalized !== "";

  // Ask the route 300ms after the last keystroke; a newer keystroke cancels it, and an answer that
  // still slips past is dropped by the `aborted` check.
  useEffect(() => {
    if (!normalized) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Search answered ${response.status}`);
        const data = (await response.json()) as SearchResponse;
        if (controller.signal.aborted) return;
        setFound({ query: normalized, films: data.films });
        setSearchFailed(false);
        setActive(0);
        setSearching(false);
      } catch {
        if (controller.signal.aborted) return;
        setSearchFailed(true);
        setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalized]);

  // A click outside closes the results.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setFocused(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // The highlighted row stays in view as the arrows move it.
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId only depends on id
  }, [activeIndex, id]);

  const add = useCallback(
    async (film: SearchFilm) => {
      if (saving !== null) return;
      setSaving(film.id);
      setAddFailed(null);
      let ok = false;
      try {
        ok = (await addToWatchList(film.id)).ok;
      } catch {
        ok = false;
      }
      setSaving(null);
      if (!ok) {
        setAddFailed(film);
        return;
      }
      setText("");
      setFound(null);
      setSearchFailed(false);
      setActive(0);
      showToast({
        tone: "info",
        icon: Check,
        title: `${film.title} added.`,
        description: "It is at the top of Want to watch.",
        duration: TOAST_MS,
      });
      // The Watch list reads the marks per request: refreshing shows the film without a reload.
      startTransition(() => router.refresh());
      inputRef.current?.focus();
    },
    [router, saving],
  );

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setDismissed(true);
      }
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (films.length === 0) return;
      event.preventDefault();
      setDismissed(false);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + films.length) % films.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Only what's on screen for the typed text, never an older answer's first row.
      if (open && fresh && activeIndex >= 0) void add(films[activeIndex]);
    }
  }

  let results: ReactNode = null;
  if (open && searchFailed) {
    results = <Message title="Search isn't available right now.">Check the connection, then type again.</Message>;
  } else if (open && fresh && films.length > 0) {
    results = (
      <>
        <div id={listId} role="listbox" aria-label="Films">
          {films.map((film, i) => (
            <Option
              key={film.id}
              film={film}
              query={shown?.query ?? ""}
              id={optionId(i)}
              active={i === activeIndex}
              busy={saving === film.id}
              onPick={() => void add(film)}
            />
          ))}
        </div>
        <div className="mt-1.5 hidden gap-3.5 border-t border-line px-2.5 pt-2.5 pb-1 text-micro text-ink-muted md:flex">
          <span>
            <kbd className={searchKbd}>↑</kbd> <kbd className={searchKbd}>↓</kbd> move
          </span>
          <span>
            <kbd className={searchKbd}>enter</kbd> add to Want to watch
          </span>
          <span>
            <kbd className={searchKbd}>esc</kbd> close
          </span>
        </div>
      </>
    );
  } else if (open && fresh) {
    results = (
      <Message title={`No film called “${text.trim()}” yet.`}>
        Films come from the awards and festivals the app follows; ask Claude to add one.
      </Message>
    );
  } else if (open && searching) {
    results = (
      <div aria-busy="true" aria-label="Searching films" className="grid gap-3 p-2.5">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const status = !open ? "" : searchFailed ? "Search isn't available right now." : !fresh ? "" : films.length > 0 ? `${films.length} films` : "No films";

  return (
    <div ref={rootRef} className="mt-6 max-w-[640px] md:mt-7">
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-small font-medium">
        Add a film
      </label>
      <div className="relative">
        <div
          className={cn(
            "flex h-12 items-center gap-2.5 rounded-[10px] border bg-surface px-3.5 text-ink transition-colors duration-[var(--dur-fast)] ease-app",
            addFailed
              ? "border-error shadow-[0_0_0_3px_var(--error-wash)]"
              : focused
                ? "border-gold-ink shadow-[0_0_0_3px_var(--gold-wash)]"
                : "border-line hover:border-line-strong",
          )}
        >
          {saving !== null ? <Spinner /> : <Plus aria-hidden="true" className="size-4 flex-none text-ink-muted" strokeWidth={1.75} />}
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={results !== null && films.length > 0}
            aria-controls={films.length > 0 ? listId : undefined}
            aria-activedescendant={open && fresh && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-busy={saving !== null}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="Type a film title"
            value={text}
            readOnly={saving !== null}
            onChange={(event) => {
              setText(event.target.value);
              setDismissed(false);
              setActive(0);
              setAddFailed(null);
            }}
            onFocus={() => {
              setFocused(true);
              setDismissed(false);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <p role="status" className="sr-only">
          {status}
        </p>
        {results ? (
          <div className="absolute top-full right-0 left-0 z-30 mt-1.5 rounded-lg bg-surface p-2 shadow-pop">{results}</div>
        ) : null}
      </div>
      {addFailed ? (
        <div role="alert" className="mt-2 flex items-start gap-3 rounded-md bg-error-wash px-4 py-3 text-small text-ink">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 flex-none text-error" strokeWidth={1.75} />
          <p className="min-w-0 flex-1">
            <strong className="font-medium text-error">Couldn&apos;t add {addFailed.title}.</strong>{" "}
            <span className="text-ink-muted">Your list is unchanged. Check the connection and try again.</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => void add(addFailed)} className="-my-1 -mr-2">
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
