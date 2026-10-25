"use client";

import { AlertCircle, Calendar, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { setRelease } from "@/app/actions/watch-list";
import { Button } from "@/components/button/Button";
import { Notice } from "@/components/notice/Notice";
import { Highlight } from "@/components/search/SearchCommand";
import { cn } from "@/lib/cn";
import { normalizeQuery } from "@/lib/search";
import { platformOptions, releaseLine, type ReleaseLine } from "@/lib/watch-list";

// Guide §8.3 "Release line and editor" (task 7.10): under a Want to watch row's scores, a button
// that reads the film's release ("12 Dec 2026 · Netflix") and opens an editor for the date and the
// platform: a popover under the button on desktop, a modal bottom sheet on phone. Save, Clear
// (empties both and saves at once) and Cancel; a failed save stays open with the values kept.

const PHONE = "(max-width: 760px)";
const subscribePhone = (onChange: () => void) => {
  const query = window.matchMedia?.(PHONE);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
};
const getPhone = () => window.matchMedia?.(PHONE).matches ?? false;

const FOCUSABLE = "input:not([readonly]), button:not([disabled])";
const PLATFORM_MAX = 40;

type Value = { releaseOn: string | null; platform: string | null };
type Saving = "save" | "clear";

const field =
  "flex h-11 items-center gap-2 rounded-[9px] border bg-surface px-3 text-small text-ink md:h-10 " +
  "transition-colors duration-[var(--dur-fast)] ease-app";
const fieldIdle = "border-line hover:border-line-strong focus-within:border-gold-ink focus-within:shadow-[0_0_0_3px_var(--gold-wash)]";
const fieldBusy = "border-transparent bg-track text-ink-muted";
const input = "min-w-0 flex-1 bg-transparent text-small text-inherit outline-none placeholder:text-ink-muted";

function LineText({ line }: { line: ReleaseLine }) {
  const real = line.kind === "coming" || line.kind === "out";
  return (
    <span className="[overflow-wrap:anywhere]">
      {line.kind === "empty" ? null : <span className="sr-only">Release: </span>}
      <span className={cn(real && "font-medium text-ink")}>{line.date}</span>
      {line.platform ? ` · ${line.platform}` : null}
    </span>
  );
}

export function ReleaseEditor({
  movieId,
  title,
  releaseOn,
  platform,
  today,
  usedPlatforms,
}: {
  movieId: number;
  title: string;
  /** `YYYY-MM-DD`, or null for TBD. */
  releaseOn: string | null;
  platform: string | null;
  /** Today in Indonesia, `YYYY-MM-DD`: the day a release turns "Out". */
  today: string;
  /** The platforms the owner has used, newest first. */
  usedPlatforms: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const id = useId();
  const phone = useSyncExternalStore(subscribePhone, getPhone, () => false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const platformRef = useRef<HTMLInputElement>(null);

  // What is saved: the props, until the page reads them again (a save shows at once, before that).
  const [saved, setSaved] = useState<Value>({ releaseOn, platform });
  const [seen, setSeen] = useState(`${releaseOn}|${platform}`);
  if (seen !== `${releaseOn}|${platform}`) {
    setSeen(`${releaseOn}|${platform}`);
    setSaved({ releaseOn, platform });
  }

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState<Saving | null>(null);
  const [failed, setFailed] = useState(false);
  const [badDate, setBadDate] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const options = platformOptions(text, usedPlatforms);
  const flat = [...options.used, ...options.suggestions];
  const activeIndex = active >= 0 && active < flat.length ? active : -1;
  const showList = open && listOpen && flat.length > 0;
  const optionId = (i: number) => `${id}-option-${i}`;
  const busy = saving !== null;
  const empty = date === "" && text.trim() === "";

  function openEditor() {
    setDate(saved.releaseOn ?? "");
    setText(saved.platform ?? "");
    setFailed(false);
    setBadDate(false);
    setListOpen(false);
    setActive(-1);
    setOpen(true);
  }

  /** Closes the editor; focus goes back to the release button unless the pointer went elsewhere. */
  function close(refocus = true) {
    setOpen(false);
    setListOpen(false);
    if (refocus) buttonRef.current?.focus();
  }

  // Opening puts focus in the Date field; on phone the page behind stays still.
  useEffect(() => {
    if (!open) return;
    dateRef.current?.focus();
    if (!phone) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
    };
  }, [open, phone]);

  // A click outside closes the popover (on phone the scrim does).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!busy && !wrapRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, busy]);

  // The highlighted suggestion stays in view as the arrows move it.
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId only depends on id
  }, [activeIndex, id]);

  async function write(next: Value, mode: Saving) {
    setSaving(mode);
    setFailed(false);
    let ok = false;
    try {
      ok = (await setRelease(movieId, next.releaseOn, next.platform)).ok;
    } catch {
      ok = false;
    }
    setSaving(null);
    if (!ok) {
      setFailed(true);
      return;
    }
    setSaved(next);
    close();
    // The Watch list reads the release notes per request: refreshing shows them without a reload.
    startTransition(() => router.refresh());
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    // A half-typed date reads as empty to the browser; saving it as TBD would lose what was typed.
    if (dateRef.current?.validity.badInput) {
      setBadDate(true);
      dateRef.current.focus();
      return;
    }
    setBadDate(false);
    void write({ releaseOn: date || null, platform: text.trim() || null }, "save");
  }

  function pick(name: string) {
    setText(name);
    setListOpen(false);
    setActive(-1);
    platformRef.current?.focus();
  }

  function onPlatformKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (flat.length === 0) return;
      event.preventDefault();
      if (!showList) {
        setListOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(activeIndex < 0 ? (step === 1 ? 0 : flat.length - 1) : (activeIndex + step + flat.length) % flat.length);
    } else if (event.key === "Enter" && showList && activeIndex >= 0) {
      // Enter picks the highlighted suggestion; with none highlighted it saves what was typed.
      event.preventDefault();
      pick(flat[activeIndex]);
    } else if (event.key === "Escape" && showList) {
      // The first Esc closes the list; the next one cancels.
      event.preventDefault();
      event.stopPropagation();
      setListOpen(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (!busy) close();
    } else if (event.key === "Tab" && phone && dialogRef.current) {
      // The phone sheet keeps focus inside.
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  // The popover closes when focus leaves it for the page.
  function onBlur(event: FocusEvent<HTMLElement>) {
    const next = event.relatedTarget as Node | null;
    if (open && !phone && !busy && next && !wrapRef.current?.contains(next)) close(false);
  }

  const line = releaseLine(saved, today);
  const query = normalizeQuery(text);
  const heading = `${id}-heading`;

  const optionRow = (name: string, index: number) => (
    <div
      key={name}
      id={optionId(index)}
      role="option"
      aria-selected={index === activeIndex}
      // Keep the focus in the field while a row is tapped.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => pick(name)}
      className={cn(
        "flex min-h-11 cursor-pointer items-center rounded-[6px] px-2 text-small hover:bg-track md:min-h-9",
        index === activeIndex && "bg-track",
      )}
    >
      <Highlight text={name} query={query} />
    </div>
  );

  return (
    <div ref={wrapRef} className="relative" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : openEditor())}
        className={cn(
          "relative mt-1 -ml-2 inline-flex min-h-7 items-center gap-1.5 rounded-pill border border-transparent pr-2.5 pl-2 text-left text-caption text-ink-muted outline-none",
          "transition-[border-color] duration-[var(--dur-fast)] ease-app hover:border-line-strong focus-visible:shadow-focus aria-expanded:border-ink",
          // A 44px hit area around the 28px line.
          "before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']",
        )}
      >
        <Calendar aria-hidden="true" className="size-3.5 flex-none text-ink-subtle" strokeWidth={1.75} />
        <LineText line={line} />
      </button>

      {open && phone ? (
        <div aria-hidden="true" onClick={() => !busy && close()} className="fixed inset-0 z-40 animate-fade bg-scrim" />
      ) : null}
      {open ? (
        <form
          ref={dialogRef}
          role="dialog"
          aria-modal={phone || undefined}
          aria-labelledby={heading}
          aria-busy={busy || undefined}
          noValidate
          onSubmit={onSubmit}
          className={cn(
            "z-50 bg-surface text-small shadow-pop",
            phone
              ? "fixed inset-x-0 bottom-0 max-h-dvh animate-sheet-up overflow-y-auto rounded-t-lg px-4 pt-[18px] pb-[22px]"
              : "absolute top-[calc(100%+6px)] left-[-8px] w-[360px] max-w-[calc(100vw-2rem)] animate-pop rounded-lg px-4 pt-4 pb-3.5",
          )}
        >
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id={heading} className="text-body font-semibold">
                Release date and platform
              </h3>
              <p className="text-caption text-ink-muted [overflow-wrap:anywhere]">{title}</p>
            </div>
            {phone ? (
              <button
                type="button"
                aria-label="Close"
                disabled={busy}
                onClick={() => close()}
                className="-mt-2.5 -mr-2.5 grid size-11 flex-none place-items-center rounded-[8px] text-ink-muted outline-none hover:bg-track hover:text-ink focus-visible:shadow-focus disabled:text-ink-faint"
              >
                <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
              </button>
            ) : null}
          </header>

          <div className="mt-3.5">
            <label htmlFor={`${id}-date`} className="mb-1.5 block text-small font-medium">
              Date
            </label>
            <div className={cn(field, busy ? fieldBusy : badDate ? "border-error shadow-[0_0_0_3px_var(--error-wash)]" : fieldIdle)}>
              <input
                ref={dateRef}
                id={`${id}-date`}
                type="date"
                value={date}
                readOnly={busy}
                aria-invalid={badDate || undefined}
                aria-describedby={`${id}-date-hint`}
                onChange={(event) => {
                  setDate(event.target.value);
                  setBadDate(false);
                }}
                className={cn(input, "[color-scheme:light]")}
              />
            </div>
            <p id={`${id}-date-hint`} className={cn("mt-1.5 text-caption", badDate ? "text-error" : "text-ink-muted")}>
              {badDate ? "That date isn't complete. Finish it, or empty the field. " : null}
              The first date you can watch it from Indonesia. Empty means TBD.
            </p>
          </div>

          <div className="mt-3.5">
            <label htmlFor={`${id}-platform`} className="mb-1.5 block text-small font-medium">
              Platform
            </label>
            <div className={cn(field, busy ? fieldBusy : fieldIdle)}>
              <input
                ref={platformRef}
                id={`${id}-platform`}
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showList}
                aria-controls={showList ? `${id}-list` : undefined}
                aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={PLATFORM_MAX}
                placeholder="Netflix, Cinema XXI"
                value={text}
                readOnly={busy}
                onFocus={() => {
                  setListOpen(true);
                  setActive(-1);
                }}
                onBlur={() => setListOpen(false)}
                onChange={(event) => {
                  setText(event.target.value);
                  setListOpen(true);
                  setActive(-1);
                }}
                onKeyDown={onPlatformKeyDown}
                className={input}
              />
            </div>
            {showList ? (
              <div
                id={`${id}-list`}
                role="listbox"
                aria-label="Platforms"
                // A scrolling box is a Tab stop in Chrome; the field already drives the list.
                tabIndex={-1}
                className="mt-1.5 max-h-[196px] overflow-y-auto rounded-[10px] border border-line bg-surface p-1"
              >
                {options.used.length > 0 ? (
                  <div role="group" aria-labelledby={`${id}-used`}>
                    <div id={`${id}-used`} className="px-2 pt-2 pb-1 text-micro text-ink-muted">
                      Used before
                    </div>
                    {options.used.map((name, i) => optionRow(name, i))}
                  </div>
                ) : null}
                {options.suggestions.length > 0 ? (
                  <div role="group" aria-labelledby={`${id}-suggestions`}>
                    <div id={`${id}-suggestions`} className="px-2 pt-2 pb-1 text-micro text-ink-muted">
                      Suggestions
                    </div>
                    {options.suggestions.map((name, i) => optionRow(name, options.used.length + i))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {failed ? (
            <Notice tone="error" icon={AlertCircle} role="alert" title="Couldn't save." className="mt-3.5 px-3.5 py-3 text-caption">
              {title}&apos;s release is as it was. Check the connection and try again.
            </Notice>
          ) : null}

          <div
            className="mt-4 flex items-center gap-2"
            // A tap on a button must not take focus from the field: that would close the list and move the button away mid-tap.
            onMouseDown={(event) => showList && event.preventDefault()}
          >
            <Button
              variant="ghost"
              className="mr-auto -ml-2.5 max-md:h-11"
              disabled={empty || (busy && saving !== "clear")}
              loading={saving === "clear"}
              onClick={() => void write({ releaseOn: null, platform: null }, "clear")}
            >
              Clear
            </Button>
            <Button variant="secondary" className="max-md:h-11" disabled={busy} onClick={() => close()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="max-md:h-11" disabled={saving === "clear"} loading={saving === "save"}>
              Save
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
