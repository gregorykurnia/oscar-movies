"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { saveMark } from "@/app/actions/marks";
import { showToast } from "@/components/toast/Toaster";
import { useOnline } from "@/lib/use-online";
import { LabelledMark, Mark, Marks } from "./Marks";
import {
  createMarksStore,
  failureMessage,
  type FilmMarksSnapshot,
  type MarkFailure,
  type MarksStore,
  type MarkValue,
  type SaveMark,
  SERVER_SNAPSHOT,
} from "./marks-store";

// Plan §5.1, §5.6: one store for the whole app, in the root layout. Every wired mark reads and
// writes it, so one tap updates every row showing that film, and the state survives moving
// between pages (the layout stays mounted). `HydrateMarks` hands it the marks the server read.

const MarksContext = createContext<MarksStore | null>(null);

function toastFailure({ title, shown, retry }: MarkFailure) {
  showToast({ title: "Couldn't save", description: failureMessage(title, shown), onRetry: retry });
}

export function MarksProvider({
  children,
  save = saveMark,
  onFailure = toastFailure,
}: {
  children: ReactNode;
  /** Tests pass their own; the app uses the Server Action. */
  save?: SaveMark;
  onFailure?: (failure: MarkFailure) => void;
}) {
  const [store] = useState(() => createMarksStore({ save, onFailure }));
  return <MarksContext value={store}>{children}</MarksContext>;
}

function useMarksStore(): MarksStore {
  const store = useContext(MarksContext);
  if (!store) throw new Error("Marks need the MarksProvider (the root layout)");
  return store;
}

/** Hands the store the marks read on the server (`null`: the read failed, marks stay disabled). */
export function HydrateMarks({ marks }: { marks: ({ movieId: number } & MarkValue)[] | null }) {
  const store = useMarksStore();
  useEffect(() => store.hydrate(marks), [store, marks]);
  return null;
}

/**
 * How many films are marked want to watch, live (the phone menu's caption). Undefined before the
 * marks are read, or outside the provider (component tests).
 */
export function useWantCount(): number | undefined {
  const store = useContext(MarksContext);
  return useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    () => store?.wantCount(),
    () => undefined,
  );
}

const noSubscribe = () => () => {};

/** One film's marks, whether they can be changed now, and the tap. */
function useFilmMarks(movieId: number, title: string) {
  const store = useMarksStore();
  const snapshot: FilmMarksSnapshot = useSyncExternalStore(
    store.subscribe,
    () => store.get(movieId),
    // A part of the page that hydrates after the marks arrived must still match the server's
    // HTML; React then re-renders it with the store's state.
    () => SERVER_SNAPSHOT.film,
  );
  const phase = useSyncExternalStore(store.subscribe, store.getPhase, () => SERVER_SNAPSHOT.phase);
  const online = useOnline();
  // Offline, or before the marks are read (or if they couldn't be), marks are disabled.
  const disabled = !online || phase !== "ready";
  return { ...snapshot, disabled, tap: (kind: "watched" | "want") => store.tap(movieId, kind, title) };
}

/** The round pair for a film row (36px, 40 on phone; `sm` is the year grid's 30px). */
export function FilmMarks({
  movieId,
  title,
  size,
  className,
}: {
  movieId: number;
  /** For the failure toast ("Hamnet is back to not watched."). */
  title: string;
  size?: "md" | "sm";
  className?: string;
}) {
  const { value, status, disabled, tap } = useFilmMarks(movieId, title);
  return (
    <Marks
      watched={value.watched}
      want={value.want}
      status={status}
      size={size}
      disabled={disabled}
      onToggle={tap}
      className={className}
    />
  );
}

/** The watched mark alone, 30px: the year grid's film column (guide §8.4). */
export function FilmWatchedMark({ movieId, title, className }: { movieId: number; title: string; className?: string }) {
  const { value, status, disabled, tap } = useFilmMarks(movieId, title);
  return (
    <Mark
      kind="watched"
      on={value.watched}
      status={status.watched}
      size="sm"
      disabled={disabled}
      onClick={() => tap("watched")}
      className={className}
    />
  );
}

/** The labelled pills, for the movie page only. */
export function FilmLabelledMarks({
  movieId,
  title,
  className,
}: {
  movieId: number;
  title: string;
  className?: string;
}) {
  const { value, status, disabled, tap } = useFilmMarks(movieId, title);
  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {(["watched", "want"] as const).map((kind) => (
        <LabelledMark
          key={kind}
          kind={kind}
          on={value[kind]}
          status={status[kind]}
          disabled={disabled}
          onClick={() => tap(kind)}
        />
      ))}
    </div>
  );
}
