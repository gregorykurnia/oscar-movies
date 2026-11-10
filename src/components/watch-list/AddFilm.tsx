"use client";

import { AlertCircle, Bookmark, Check, ChevronRight, Plus, Search, X } from "lucide-react";
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
import { type AddFilmResult } from "@/lib/add-film";
import { type CatalogueFilm } from "@/lib/movie-catalogue/contract";
import { Notice } from "@/components/notice/Notice";
import { FilmForm, formButton } from "./FilmForm";
import { useCatalogueSearch } from "./useCatalogueSearch";

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
  const popoverRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const adding = useRef(false);

  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState<number | null>(null);
  const [addFailed, setAddFailed] = useState<SearchFilm | null>(null);
  const [panel, setPanel] = useState<"catalogue" | "manual" | null>(null);
  const [picked, setPicked] = useState<CatalogueFilm | null>(null);
  const [catalogueActive, setCatalogueActive] = useState(0);
  const [panelBusy, setPanelBusy] = useState(false);
  const catalogue = useCatalogueSearch(text, panel === "catalogue");
  const catalogueId = `${id}-catalogue`;
  const catalogueIndex = catalogue.films.length ? Math.min(catalogueActive, catalogue.films.length - 1) : -1;

  const normalized = normalizeQuery(text);
  const shown = normalized && found ? found : null;
  const fresh = shown !== null && shown.query === normalized;
  const films = fresh && shown && !searchFailed ? shown.films : [];
  const activeIndex = films.length > 0 ? Math.min(active, films.length - 1) : -1;
  const open = panel === null && focused && !dismissed && normalized !== "";
  const inlineResults = fresh && films.length === 0;

  // The short landscape viewport must keep the box and the extra ways to add together.
  useEffect(() => {
    if (!open || !popoverRef.current || !rootRef.current) return;
    const frame = window.requestAnimationFrame?.(() => {
      const bottom = popoverRef.current!.getBoundingClientRect().bottom;
      const top = rootRef.current!.getBoundingClientRect().top;
      const overflow = bottom - (window.visualViewport?.height ?? window.innerHeight) + 12;
      if (overflow > 0) window.scrollBy(0, inlineResults ? Math.max(0, top - 12) : Math.min(overflow, Math.max(0, top - 72)));
    });
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame); };
  }, [open, fresh, searchFailed, searching, films.length, inlineResults]);

  useEffect(() => {
    if (panel === "catalogue" && !picked) rootRef.current?.scrollIntoView?.({ block: "start" });
    else if (panel) panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [panel, picked]);

  useEffect(() => {
    if (panel === "catalogue" && !picked && catalogueIndex >= 0) {
      document.getElementById(`${catalogueId}-${catalogueIndex}`)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [panel, picked, catalogueId, catalogueIndex]);

  function openPanel(value: "catalogue" | "manual") {
    if (saving !== null || panelBusy) return;
    setPanel(value); setPicked(null); setDismissed(true); setAddFailed(null);
    if (value === "catalogue") inputRef.current?.focus();
  }

  function closePanel() {
    if (panelBusy) return;
    setPanel(null); setPicked(null);
    inputRef.current?.focus();
    setDismissed(true);
  }

  function added(film: { title: string; slug: string }, refreshRequired = false) {
    const sort = new URLSearchParams(window.location.search).get("sort");
    const mine = !sort || sort === "mine";
    setText(""); setFound(null); setSearchFailed(false); setActive(0); setPanel(null); setPicked(null);
    showToast({ tone: "info", icon: Check, title: `${film.title} added`, duration: TOAST_MS,
      description: refreshRequired ? "Saved. Reload if your list has not updated." : mine ? "It is at the top of Want to watch." : "Added to Want to watch.",
      action: { label: "Open film", href: `/movies/${film.slug}` },
    });
    startTransition(() => router.refresh());
    inputRef.current?.focus();
  }

  function saved(result: Extract<AddFilmResult, { ok: true }>) { added(result.film, result.refreshRequired); }

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
      if (adding.current) return;
      adding.current = true;
      setSaving(film.id);
      setAddFailed(null);
      let ok = false;
      try {
        ok = (await addToWatchList(film.id)).ok;
      } catch {
        ok = false;
      }
      setSaving(null);
      adding.current = false;
      if (!ok) {
        setAddFailed(film);
        return;
      }
      added(film);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- added uses stable setters, router and the current address
    [router],
  );

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (panelBusy || saving !== null) return;
    if (panel === "catalogue") {
      if (picked) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!catalogue.films.length) return;
        event.preventDefault();
        setCatalogueActive((catalogueIndex + (event.key === "ArrowDown" ? 1 : -1) + catalogue.films.length) % catalogue.films.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (catalogueIndex >= 0 && !catalogue.error) setPicked(catalogue.films[catalogueIndex]);
      }
      return;
    }
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
      else if (open && fresh && !searchFailed) openPanel("catalogue");
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
      <Message title={`No film called “${text.trim()}” in the app yet.`}>
        Search more films to find it, or add it by hand.
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
    <div ref={rootRef} className="mt-6 max-w-[640px] scroll-mt-3 md:mt-7" onKeyDown={(event) => {
      if (event.key === "Escape" && panel) { event.preventDefault(); event.stopPropagation(); closePanel(); }
    }}>
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
            aria-expanded={panel === "catalogue" ? !picked && catalogue.films.length > 0 && !catalogue.error : results !== null && films.length > 0}
            aria-controls={panel === "catalogue" && !picked && !catalogue.error && catalogue.films.length ? catalogueId : open && films.length > 0 ? listId : undefined}
            aria-activedescendant={panel === "catalogue" && !picked && !catalogue.error && catalogueIndex >= 0 ? `${catalogueId}-${catalogueIndex}` : open && fresh && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-busy={saving !== null || panelBusy}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="Type a film title"
            value={text}
            readOnly={saving !== null || panelBusy}
            onChange={(event) => {
              setText(event.target.value);
              setDismissed(false);
              setActive(0);
              setAddFailed(null);
              if (panel === "catalogue") { setPicked(null); setCatalogueActive(0); }
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
        {open ? (
          <div ref={popoverRef} className={cn("mt-1.5 flex max-h-[calc(100dvh-160px)] flex-col rounded-[14px] bg-surface p-2", inlineResults ? "relative border border-line" : "absolute top-full right-0 left-0 z-30 shadow-pop")}>
            <div className="min-h-0 overflow-y-auto">{results}</div>
            <div className="mt-1.5 flex flex-none flex-wrap gap-2 border-t border-line px-1.5 pt-2.5 pb-1">
              <Button size="sm" className="h-11 md:h-8" disabled={saving !== null} onClick={() => openPanel("catalogue")}><Search strokeWidth={1.75} />Search more films</Button>
              <Button size="sm" variant="ghost" className="h-11 md:h-8" disabled={saving !== null} onClick={() => openPanel("manual")}><Plus strokeWidth={1.75} />Add manually</Button>
            </div>
          </div>
        ) : null}
      </div>
      {panel ? <section ref={panelRef} role="region" aria-labelledby={`${id}-panel-title`} aria-busy={panelBusy || (panel === "catalogue" && !picked && catalogue.busy)}
        className="mt-3 scroll-mt-16 rounded-[14px] border border-line bg-surface p-3.5 md:p-4">
        <header className="flex items-start justify-between gap-3">
          <div><h2 id={`${id}-panel-title`} className="text-body font-semibold">{panel === "manual" ? "Add manually" : picked ? "Add to Want to watch" : "Search more films"}</h2>
            <p className="text-caption text-ink-muted">{panel === "manual" ? "For a film TMDB doesn't have. A title and a year are enough." : picked ? "Confirm the film and year before adding it." : "Films from TMDB. Pick yours by its title and year."}</p></div>
          <button type="button" aria-label="Close add film panel" disabled={panelBusy} onClick={closePanel} className="-mt-2 -mr-2 grid size-11 flex-none place-items-center rounded-lg text-ink-muted outline-none hover:bg-track focus-visible:shadow-focus"><X className="size-[18px]" strokeWidth={1.75} /></button>
        </header>
        {panel === "manual" || picked ? <FilmForm key={picked?.tmdbId ?? "manual"} film={picked} initialTitle={text} onTitleChange={setText} onBusy={setPanelBusy} onSaved={saved}
          onBack={panel === "manual" ? closePanel : () => { setPicked(null); inputRef.current?.focus(); }} /> : <>
          <p role="status" className="mt-2.5 text-caption text-ink-muted">{catalogue.busy ? "Searching TMDB…" : catalogue.error ? "TMDB search failed" : !catalogue.query ? "Type a film title in Add a film." : `${catalogue.films.length} films on TMDB for “${text.trim()}”`}</p>
          {catalogue.error ? <div className="mt-3"><Notice tone="error" role="alert" title={catalogue.error.message} />{catalogue.error.retry ? <Button variant="ghost" onClick={catalogue.retry} className={formButton}>Try again</Button> : null}</div>
            : catalogue.films.length ? <div id={catalogueId} role="listbox" aria-label="Films from TMDB" className="mt-1.5 -mx-2">
              {catalogue.films.map((film, index) => <div key={film.tmdbId} id={`${catalogueId}-${index}`} role="option" aria-selected={index === catalogueIndex}
                onMouseDown={(event) => event.preventDefault()} onClick={() => setPicked(film)}
                onPointerMove={() => setCatalogueActive(index)}
                className={cn("grid min-h-14 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2.5 text-small", index === catalogueIndex && "bg-track")}>
                <div className="min-w-0 [overflow-wrap:anywhere]"><span className="font-medium">{film.title}</span>
                  <span className="block text-caption text-ink-muted">{film.year ?? "Year unknown"}{film.originalTitle && film.originalTitle !== film.title ? ` · ${film.originalTitle}` : ""}</span>
                  <span className="mt-0.5 line-clamp-2 text-caption text-pretty text-ink-muted">{film.overview}</span></div><ChevronRight aria-hidden="true" className="size-4 text-ink-subtle" strokeWidth={1.75} />
              </div>)}
            </div> : catalogue.busy ? catalogue.skeleton ? <div aria-label="Searching TMDB" className="grid gap-3 py-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : null
              : catalogue.query ? <Message title={`No film called “${text.trim()}” on TMDB.`}>Check the spelling, or add it manually.</Message> : null}
          <footer className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
            <span className="text-caption text-ink-muted">Not on TMDB?</span><Button variant="ghost" className={formButton} onClick={() => openPanel("manual")}><Plus strokeWidth={1.75} />Add manually</Button>
            {catalogue.nextPage ? <Button variant="ghost" className={cn(formButton, "ml-auto")} disabled={catalogue.busy} onClick={catalogue.more}>Show more results</Button> : null}
          </footer>
        </>}
      </section> : null}
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
