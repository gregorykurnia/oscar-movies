"use client";

import { Award, Search, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { IconButton } from "@/components/app-shell/IconButton";
import { Button } from "@/components/button/Button";
import { StagePill } from "@/components/stage-pill/StagePill";
import { cn } from "@/lib/cn";
import {
  highlightParts,
  matchRange,
  normalizeQuery,
  type SearchAward,
  type SearchFilm,
  type SearchResponse,
} from "@/lib/search";
import { OPEN_SEARCH_EVENT } from "./open-search";

// Guide §7 Search. One search for the whole app, in the top bar. Desktop (≥1101px): the box is the
// input and the results drop under it as a 440px popover. Compact (761–1100px): the search icon
// opens the same popover with the input at its top. Phone (≤760px): a full-screen sheet with the
// input and "Cancel". Debounced 120ms; an answer that arrives after a newer keystroke is dropped.
// `/` opens it from anywhere, Esc closes it, ↑ ↓ move the highlighted row and Enter opens it.

const DEBOUNCE_MS = 120;
const WIDE = "(min-width: 1101px)";
const PHONE = "(max-width: 760px)";

const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia?.(WIDE);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
};
const getWide = () => window.matchMedia?.(WIDE).matches ?? false;

// The flags' artwork is large and only results need it, so it loads the first time search opens.
const LazyFlag = lazy(() => import("@/components/flag/Flag").then((m) => ({ default: m.Flag })));

function ResultFlag({ code }: { code: string | null }) {
  // `--line`, not `--track`: the highlighted row is `--track`, and the placeholder must show on it.
  const blank = <span aria-hidden="true" className="block h-3.5 w-[21px] rounded-xs bg-line" />;
  if (!code) return blank;
  return (
    <Suspense fallback={blank}>
      <LazyFlag code={code} />
    </Suspense>
  );
}

const kbd = "rounded-[5px] border border-line bg-surface px-1.5 text-micro leading-[18px] text-ink-muted";

/** The text with the part that matched the query underlined in gold. */
function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="bg-transparent text-inherit underline decoration-gold decoration-2 underline-offset-[3px]">
            {part.text}
          </mark>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

const optionClasses =
  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] p-2.5 text-small outline-none hover:bg-track";

function FilmOption({
  film,
  query,
  id,
  active,
  onNavigate,
}: {
  film: SearchFilm;
  query: string;
  id: string;
  active: boolean;
  onNavigate: () => void;
}) {
  // A film found by its original title shows that title, so the match isn't a mystery.
  const viaOriginal = matchRange(film.title, query) === null && film.originalTitle !== null;
  const meta = [String(film.year), film.categories.join(", ")].filter(Boolean).join(" · ");
  return (
    <Link
      href={film.href}
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onClick={onNavigate}
      className={cn(optionClasses, active && "bg-track")}
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
        </span>
      </span>
      {film.stage ? <StagePill stage={film.stage} /> : <span />}
    </Link>
  );
}

function AwardOption({
  award,
  query,
  id,
  active,
  onNavigate,
}: {
  award: SearchAward;
  query: string;
  id: string;
  active: boolean;
  onNavigate: () => void;
}) {
  const viaShortName = matchRange(award.name, query) === null && award.shortName !== award.kindLabel;
  return (
    <Link
      href={award.href}
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onClick={onNavigate}
      className={cn(optionClasses, active && "bg-track")}
    >
      <span aria-hidden="true" className="grid size-[21px] place-items-center text-ink-muted">
        <Award className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
        <Highlight text={award.name} query={query} />
        <span className="block text-caption font-normal text-ink-muted">
          {viaShortName ? (
            <>
              <Highlight text={award.shortName} query={query} />
              {" · "}
            </>
          ) : null}
          {award.kindLabel}
        </span>
      </span>
      <span />
    </Link>
  );
}

function Message({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="px-4 pt-7 pb-6 text-center text-small text-ink-muted">
      {icon ? <div className="mb-2 grid place-items-center">{icon}</div> : null}
      <strong className="mb-1 block font-medium text-ink">{title}</strong>
      {children}
    </div>
  );
}

/**
 * The top bar's search: the box (desktop) or icon button (compact, phone), the results panel and
 * the `/` key. `open` is the parent's so the phone menu's search button can open it too.
 */
export function SearchCommand({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-option-${i}`;
  const wide = useSyncExternalStore(subscribeWide, getWide, () => false);

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; data: SearchResponse } | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxButtonRef = useRef<HTMLButtonElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  const normalized = normalizeQuery(query);
  // Results are kept while the next answer loads; they go when the query is cleared or search closes.
  const shown = normalized && found ? found : null;
  const fresh = shown !== null && shown.query === normalized;
  // The options are only those on screen: none while the box is empty or the failure shows, so
  // Enter and the arrows never reach a hidden result (1.R).
  const listed = shown !== null && !failed ? shown : null;
  const films = listed?.data.films ?? [];
  const awards = listed?.data.awards ?? [];
  const hrefs = [...films.map((f) => f.href), ...awards.map((a) => a.href)];
  const activeIndex = hrefs.length > 0 ? Math.min(active, hrefs.length - 1) : -1;

  const close = useCallback(() => {
    setQuery("");
    setFound(null);
    setFailed(false);
    setActive(0);
    onOpenChange(false);
  }, [onOpenChange]);

  // Ask the route 120ms after the last keystroke; a newer keystroke cancels the request, and an
  // answer that still slips past is dropped by the `aborted` check.
  useEffect(() => {
    if (!open || !normalized) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Search answered ${response.status}`);
        const data = (await response.json()) as SearchResponse;
        if (controller.signal.aborted) return;
        setFound({ query: normalized, data });
        setFailed(false);
        setActive(0);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, normalized]);

  // While open: focus the input, keep the page behind the phone sheet still, close on a click outside.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    if (window.matchMedia?.(PHONE).matches) root.style.overflow = "hidden";
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      root.style.overflow = overflow;
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, wide, close]);

  // Closing puts focus back on the button or box that opened it.
  useEffect(() => {
    if (wasOpen.current && !open) (wide ? boxButtonRef : iconButtonRef).current?.focus();
    wasOpen.current = open;
  }, [open, wide]);

  // `/` opens search from anywhere except a field; the 404's button sends an event.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      onOpenChange(true);
    };
    const onRequest = () => onOpenChange(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onRequest);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onRequest);
    };
  }, [onOpenChange]);

  // The highlighted row stays in view as the arrows move it.
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId only depends on id
  }, [activeIndex, id]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (hrefs.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + hrefs.length) % hrefs.length);
    } else if (event.key === "Enter" && event.target === inputRef.current && activeIndex >= 0) {
      event.preventDefault();
      go(hrefs[activeIndex]);
    } else if (event.key === "Tab") {
      if (window.matchMedia?.(PHONE).matches && panelRef.current) {
        // The phone sheet keeps focus inside: the input and Cancel.
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>("input, button"));
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      } else {
        // The popover closes when focus leaves it for the page.
        event.preventDefault();
        close();
      }
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="text"
      role="combobox"
      aria-label="Search films and awards"
      aria-autocomplete="list"
      aria-expanded={hrefs.length > 0}
      aria-controls={hrefs.length > 0 ? listId : undefined}
      aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="search"
      placeholder="Search films and awards"
      value={query}
      onChange={(event) => {
        setQuery(event.target.value);
        setActive(0);
      }}
      className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-muted"
    />
  );

  const focusedBox =
    "flex items-center gap-2 rounded-[9px] border border-gold-ink bg-surface pr-2.5 pl-3 text-ink shadow-[0_0_0_3px_var(--gold-wash)]";

  let results: ReactNode = null;
  if (normalized && failed) {
    results = (
      <Message icon={<WifiOff aria-hidden="true" className="size-5" strokeWidth={1.75} />} title="Search isn't available right now.">
        Check the connection, then type again.
      </Message>
    );
  } else if (shown && hrefs.length > 0) {
    results = (
      <>
        <div id={listId} role="listbox" aria-label="Search results">
          {films.length > 0 ? (
            <div role="group" aria-labelledby={`${id}-films`}>
              <div id={`${id}-films`} className="px-2.5 pt-2.5 pb-1.5 text-micro text-ink-muted">
                Films
              </div>
              {films.map((film, i) => (
                <FilmOption key={film.slug} film={film} query={shown.query} id={optionId(i)} active={i === activeIndex} onNavigate={close} />
              ))}
            </div>
          ) : null}
          {awards.length > 0 ? (
            <div role="group" aria-labelledby={`${id}-awards`}>
              <div id={`${id}-awards`} className="px-2.5 pt-2.5 pb-1.5 text-micro text-ink-muted">
                Awards and festivals
              </div>
              {awards.map((award, i) => (
                <AwardOption
                  key={award.slug}
                  award={award}
                  query={shown.query}
                  id={optionId(films.length + i)}
                  active={films.length + i === activeIndex}
                  onNavigate={close}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-1.5 hidden gap-3.5 border-t border-line px-2.5 pt-2.5 pb-1 text-micro text-ink-muted md:flex">
          <span>
            <kbd className={kbd}>↑</kbd> <kbd className={kbd}>↓</kbd> move
          </span>
          <span>
            <kbd className={kbd}>enter</kbd> open
          </span>
          <span>
            <kbd className={kbd}>esc</kbd> close
          </span>
        </div>
      </>
    );
  } else if (fresh) {
    results = (
      <Message title={`No movie or award matches “${query.trim()}”.`}>Check the spelling, or try the original title.</Message>
    );
  }

  const status = !open || !normalized ? "" : failed ? "Search isn't available right now." : !fresh ? "" : hrefs.length > 0 ? `${hrefs.length} results` : "No results";

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} className="relative ml-auto -mr-1.5 md:mr-0">
      {open && wide ? (
        <div className={cn(focusedBox, "h-[38px] w-[260px]")}>
          <Search aria-hidden="true" className="size-4 flex-none text-ink-muted" strokeWidth={1.75} />
          {input}
          <kbd className={kbd}>esc</kbd>
        </div>
      ) : (
        <button
          ref={boxButtonRef}
          type="button"
          aria-label="Search films and awards"
          aria-keyshortcuts="/"
          onClick={() => onOpenChange(true)}
          className="hidden h-[38px] w-[260px] items-center gap-2 rounded-[9px] border border-line bg-paper pr-2.5 pl-3 text-small text-ink-muted outline-none transition-colors duration-[var(--dur-fast)] ease-app hover:border-line-strong focus-visible:shadow-focus xl:flex"
        >
          <Search aria-hidden="true" className="size-4 flex-none" strokeWidth={1.75} />
          <span className="flex-1 truncate text-left">Search films and awards</span>
          <kbd className={kbd}>/</kbd>
        </button>
      )}
      <IconButton
        ref={iconButtonRef}
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={open && !wide}
        aria-keyshortcuts="/"
        onClick={() => onOpenChange(true)}
        className="xl:hidden"
      >
        <Search aria-hidden="true" strokeWidth={1.75} />
      </IconButton>

      {open ? <p role="status" className="sr-only">{status}</p> : null}

      {open && wide && results ? (
        <div className="absolute top-full right-0 z-40 mt-1.5 w-[440px] rounded-lg bg-surface p-2 shadow-pop">{results}</div>
      ) : null}
      {open && !wide ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Search"
          className="fixed inset-0 z-50 flex animate-sheet flex-col bg-surface md:absolute md:inset-auto md:top-full md:right-0 md:mt-1.5 md:block md:w-[440px] md:animate-none md:rounded-lg md:p-2 md:shadow-pop"
        >
          <div className="flex flex-none items-center gap-2 border-b border-line px-4 py-2.5 md:border-0 md:p-0 md:pb-1">
            <div className={cn(focusedBox, "h-10 flex-1")}>
              <Search aria-hidden="true" className="size-4 flex-none text-ink-muted" strokeWidth={1.75} />
              {input}
            </div>
            <Button variant="ghost" onClick={close} className="md:hidden">
              Cancel
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 md:max-h-[min(70vh,28rem)] md:flex-none md:px-0 md:pb-0">{results}</div>
        </div>
      ) : null}
    </div>
  );
}
