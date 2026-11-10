"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { addFilm } from "@/app/actions/add-film";
import { Button } from "@/components/button/Button";
import { Notice } from "@/components/notice/Notice";
import { type AddFilmInput, type AddFilmResult, type SavedFilm } from "@/lib/add-film";
import { cn } from "@/lib/cn";
import { catalogueErrors, type CatalogueFilm } from "@/lib/movie-catalogue/contract";

export const formButton = "h-11 md:h-10";

// getRandomValues also works on the owner's HTTP Tailscale preview (randomUUID requires HTTPS).
function draftId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function FilmForm({ film, initialTitle, onBack, onSaved, onBusy }: {
  film: CatalogueFilm | null; initialTitle: string; onBack: () => void;
  onSaved: (result: Extract<AddFilmResult, { ok: true }>) => void; onBusy: (busy: boolean) => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(initialTitle);
  const [year, setYear] = useState("");
  const [errors, setErrors] = useState({ title: "", year: "" });
  const [failure, setFailure] = useState<string | null>(null);
  const [matches, setMatches] = useState<SavedFilm[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [missingYear, setMissingYear] = useState(false);
  const identity = useRef<string | null>(null);
  const inFlight = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const needsYear = !film || film.year === null || missingYear;

  useEffect(() => {
    if (needsYear) yearRef.current?.focus();
    else formRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  }, [needsYear]);

  function edit() {
    // A changed draft after an uncertain response is a new identity, never an edit of the old film.
    identity.current = null;
    setMatches([]); setFailure(null); setErrors({ title: "", year: "" }); setConflict(false);
  }

  async function save(duplicate?: Extract<AddFilmInput, { kind: "manual" }>["duplicate"]) {
    if (inFlight.current) return;
    const problems = {
      title: !film && !title.trim() ? "Type the film's title." : !film && title.trim().length > 300 ? "Keep the title under 300 characters." : "",
      year: needsYear && (!/^\d{4}$/.test(year) || Number(year) < 1800) ? "Type a year from 1800 to 9999." : "",
    };
    setErrors(problems);
    if (problems.title || problems.year) { (problems.title ? titleRef : yearRef).current?.focus(); return; }
    identity.current ??= draftId();
    const input: AddFilmInput = film
      ? { kind: "catalogue", localId: identity.current, tmdbId: film.tmdbId, ...(needsYear ? { year: Number(year) } : {}) }
      : { kind: "manual", localId: identity.current, title: title.trim(), year: Number(year), ...(duplicate ? { duplicate } : {}) };
    inFlight.current = true; setBusy(true); onBusy(true); setFailure(null);
    let result: AddFilmResult;
    try { result = await addFilm(input); } catch { result = { ok: false, reason: "failed" }; }
    inFlight.current = false; setBusy(false); onBusy(false);
    if (result.ok) { onSaved(result); return; }
    if (result.reason === "duplicate") { setMatches(result.matches); setSelected(0); return; }
    if (result.reason === "missing-year") { setMissingYear(true); setErrors((old) => ({ ...old, year: "Type a year from 1800 to 9999." })); return; }
    if (result.reason === "draft-changed") identity.current = null;
    setConflict(result.reason === "identity-conflict");
    setFailure(result.reason === "identity-conflict" ? "TMDB links it to two different films in the app, so nothing was added."
      : result.reason in catalogueErrors ? catalogueErrors[result.reason as keyof typeof catalogueErrors]
      : "Your list is unchanged. Check the connection and add it again.");
  }

  function submit(event: FormEvent) { event.preventDefault(); void save(matches.length ? { kind: "use", movieId: matches[selected].id } : undefined); }
  function field(name: "title" | "year") {
    const error = errors[name];
    return <div className={name === "year" ? "min-w-0 md:max-w-[232px]" : "min-w-0"}>
      <label htmlFor={`${id}-${name}`} className="mb-1.5 block text-small font-medium">{name === "title" ? "Title" : "Release or planned year"}</label>
      <input ref={name === "title" ? titleRef : yearRef} id={`${id}-${name}`} value={name === "title" ? title : year}
        onChange={(event) => { edit(); if (name === "title") setTitle(event.target.value); else setYear(event.target.value); }}
        readOnly={busy} inputMode={name === "year" ? "numeric" : "text"} enterKeyHint="done" autoComplete="off"
        aria-invalid={!!error} aria-describedby={`${id}-${name}-hint`}
        className={cn("h-11 w-full rounded-[9px] border bg-surface px-3 text-small outline-none md:h-10", busy ? "border-transparent bg-track text-ink-muted" : error ? "border-error shadow-[0_0_0_3px_var(--error-wash)] focus:border-error focus:shadow-[0_0_0_3px_var(--error-wash)]" : "border-line hover:border-line-strong focus:border-gold-ink focus:shadow-[0_0_0_3px_var(--gold-wash)]")} />
      <p id={`${id}-${name}-hint`} className={cn("mt-1.5 text-caption", error ? "text-error" : "text-ink-muted")}>
        {error || (name === "year" ? film ? "TMDB has no date for it yet." : "The year it came out, or is planned to." : "")}
      </p>
    </div>;
  }

  return <form ref={formRef} onSubmit={submit} noValidate aria-busy={busy} className="mt-3.5">
    {film ? <div className="[overflow-wrap:anywhere]">
      <p className="text-micro text-ink-muted">From TMDB</p>
      <h3 className="mt-0.5 text-title font-medium">{film.title}</h3>
      <p className="mt-0.5 text-small text-ink-muted">{missingYear ? "Year unknown" : film.year ?? "Year unknown"}{film.originalTitle && film.originalTitle !== film.title ? ` · ${film.originalTitle}` : ""}</p>
      <p className="mt-2 max-h-[24vh] max-w-[60ch] overflow-y-auto text-small text-ink-muted">{film.overview}</p>
      {needsYear ? <div className="mt-3">{field("year")}</div> : null}
    </div> : <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_232px]">{field("title")}{field("year")}</div>}
    {matches.length ? <div className="mt-3">
      <Notice title={`The app already has ${title.trim()} from ${year}.`}>Use it, or add a different film with the same title.</Notice>
      <div role="radiogroup" aria-label="Existing films" className="mt-2.5 rounded-[10px] border border-line p-1">
        {matches.map((match, index) => <label key={match.id} className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 text-small hover:bg-track">
          <input type="radio" name={`${id}-duplicate`} checked={index === selected} disabled={busy} onChange={() => setSelected(index)} className="accent-gold-ink" />
          <span className="min-w-0 [overflow-wrap:anywhere]"><span className="font-medium">{match.title}</span><span className="block text-caption text-ink-muted">{match.year}</span></span>
        </label>)}
      </div>
    </div> : null}
    {failure ? <Notice tone="error" role="alert" title={`Couldn't add ${film?.title ?? title.trim()}.`} className="mt-3 [overflow-wrap:anywhere]">{failure}</Notice> : null}
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <Button onClick={matches.length ? () => void save({ kind: "different" }) : onBack} disabled={busy} className={formButton}>
        {matches.length ? "Add a different film" : film ? "Back to results" : "Cancel"}
      </Button>
      {!conflict ? <Button type="submit" variant="primary" loading={busy} className={formButton}>{matches.length ? "Use this film" : failure ? "Try again" : "Add to Want to watch"}</Button> : null}
    </div>
  </form>;
}
