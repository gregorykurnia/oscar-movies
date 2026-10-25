"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { reorderWatchList } from "@/app/actions/watch-list";
import { FilmList } from "@/components/film-row/FilmRow";
import { useReadWant } from "@/components/marks/MarksProvider";
import { FAILED_RING_MS, SAVING_DELAY_MS } from "@/components/marks/marks-store";
import { Notice } from "@/components/notice/Notice";
import { searchKbd } from "@/components/search/search-styles";
import { showToast } from "@/components/toast/Toaster";
import { cn } from "@/lib/cn";
import { moveItem, orderToSave, reorderWords } from "@/lib/watch-list";

// Guide §8.3 "My order and the drag handle" (task 7.9): Want to watch under My order. Rows move
// only by their handle, with a mouse, a finger or the keyboard (space lifts, ↑ ↓ move, space
// drops, esc puts it back). The new order shows at once and saves through `reorderWatchList`;
// if that fails the rows go back, the moved row's handle turns red for 2s and a toast offers
// "Try again". The rows come from the server (FilmRow with a `DragHandle`); this list owns
// their order.

export type SortableFilm = { id: number; title: string; row: ReactNode };

type HandleState = "resting" | "lifted" | "keyboard" | "saving" | "paused" | "failed";
type HandleProps = {
  title: string;
  state: HandleState;
  ref?: (node: HTMLElement | null) => void;
  props?: Record<string, unknown>;
};

const HandleContext = createContext<HandleProps | null>(null);

// The lifted row floats 12px wider on each side (8 on phone); its old place is a dashed slot.
// Both are drawn by a pseudo-element behind the row, so the row's own box (which the drag
// measures) never changes. A winner's gold wash keeps inside the card.
const card =
  "relative isolate before:absolute before:inset-y-0 before:-inset-x-3 before:-z-10 before:rounded-md " +
  "before:content-[''] max-md:before:-inset-x-2 [&>[data-winner]]:mx-0 [&>[data-winner]]:px-0";
const lifted = cn(
  card,
  "z-10 *:border-b-transparent before:bg-surface before:shadow-pop before:outline before:outline-1 before:outline-line",
);
const slot = cn(
  card,
  "*:invisible before:bg-track before:outline before:outline-1 before:-outline-offset-1 before:outline-dashed before:outline-line-strong",
);

// `--ease` (tokens.css, guide §12) spelled out: the drop animation runs through `element.animate`,
// which can't read a CSS variable.
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";

// The lifted row follows the pointer up and down only, so the page never scrolls sideways.
const upAndDownOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** The handle at the start of a Want to watch row; it reads its row from the list. */
export function DragHandle() {
  const handle = useContext(HandleContext);
  if (!handle) return null;
  const { title, state, ref, props } = handle;
  return (
    <button
      type="button"
      ref={ref}
      {...props}
      aria-label={`Reorder ${title}`}
      data-state={state}
      className={cn(
        "relative grid h-9 w-7 flex-none touch-none place-items-center rounded-[8px] outline-none",
        "transition-[background-color,color] duration-[var(--dur-fast)] ease-app",
        // A 44px hit area around the 28×36 button.
        "before:absolute before:-inset-x-2 before:-inset-y-1 before:content-['']",
        "focus-visible:text-ink focus-visible:shadow-focus",
        state === "resting" && "cursor-grab text-ink-subtle hover:bg-track hover:text-ink",
        state === "lifted" && "cursor-grabbing text-ink",
        state === "keyboard" && "text-ink shadow-focus",
        (state === "saving" || state === "paused") && "cursor-default text-ink-faint",
        state === "failed" && "cursor-grab text-error",
      )}
    >
      {state === "saving" ? (
        <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-gold border-r-transparent" />
      ) : (
        <GripVertical aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      )}
    </button>
  );
}

type Saving = { id: number; ring: boolean };

export function SortableWantList({
  films,
  head,
  columns,
}: {
  films: SortableFilm[];
} & Pick<ComponentProps<typeof FilmList>, "head" | "columns">) {
  const router = useRouter();
  const readWant = useReadWant();
  const byId = new Map(films.map((f) => [f.id, f]));
  const titleOf = (id: UniqueIdentifier) => byId.get(Number(id))?.title ?? "the film";

  const [order, setOrderState] = useState(() => films.map((f) => f.id));
  const orderRef = useRef(order);
  const setOrder = (next: number[]) => {
    orderRef.current = next;
    setOrderState(next);
  };

  const [active, setActive] = useState<{ id: number; keyboard: boolean } | null>(null);
  const [overIndex, setOverIndex] = useState(0);
  const [saving, setSaving] = useState<Saving | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
    return t;
  };

  const sensors = useSensors(
    // Mouse, pen and finger (the handle has touch-action: none, so a finger drags, not scrolls).
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space", "Enter"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  // One save at a time: dragging waits on `saving`, and this also stops a toast's "Try again"
  // from starting a second save whose failure would put back rows the first one moved (7.R).
  const saveInFlight = useRef(false);

  /** Moves `id` to place `to`, shows it at once and saves; on failure the rows go back. */
  const commit = useCallback(
    function commit(id: number, to: number) {
      if (saveInFlight.current) return;
      const previous = orderRef.current;
      const from = previous.indexOf(id);
      if (from < 0) return;
      const next = moveItem(previous, from, to);
      saveInFlight.current = true;
      setOrder(next);
      setFailed(null);
      setSaving({ id, ring: false });
      const ring = later(() => setSaving((s) => (s?.id === id ? { id, ring: true } : s)), SAVING_DELAY_MS);

      const fail = (reason: "stale" | "failed") => {
        saveInFlight.current = false;
        clearTimeout(ring);
        setSaving(null);
        setOrder(previous);
        setFailed(id);
        later(() => setFailed((f) => (f === id ? null : f)), FAILED_RING_MS);
        if (reason === "stale") {
          // The list changed since the page was read (another tab, or a mark tapped here): read it again.
          router.refresh();
          showToast({
            title: "Couldn't save the order",
            description: "Your list changed since the page opened, so it has been read again. Try the move once more.",
          });
        } else {
          showToast({
            title: "Couldn't save the order",
            description: "Your list is back as it was. Check the connection and try again.",
            onRetry: () => commit(id, to),
          });
        }
      };

      reorderWatchList(orderToSave(next, readWant)).then(
        (result) => {
          if (!result.ok) return fail(result.reason);
          saveInFlight.current = false;
          clearTimeout(ring);
          setSaving(null);
        },
        () => fail("failed"),
      );
    },
    // `later` and `setOrder` only touch refs and state setters.
    [readWant, router],
  );

  const onDragStart = ({ active: a, activatorEvent }: DragStartEvent) => {
    const id = Number(a.id);
    setActive({ id, keyboard: activatorEvent instanceof KeyboardEvent });
    setOverIndex(orderRef.current.indexOf(id));
  };
  const onDragOver = ({ over }: DragOverEvent) => {
    if (over) setOverIndex(orderRef.current.indexOf(Number(over.id)));
  };
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setActive(null);
    if (!over || over.id === a.id) return;
    commit(Number(a.id), orderRef.current.indexOf(Number(over.id)));
  };

  const total = order.length;
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => reorderWords.lifted(titleOf(a.id), order.indexOf(Number(a.id)), total),
    onDragOver: ({ active: a, over }) =>
      over ? reorderWords.moved(titleOf(a.id), order.indexOf(Number(over.id)), total) : undefined,
    onDragEnd: ({ active: a, over }) =>
      reorderWords.dropped(titleOf(a.id), order.indexOf(Number((over ?? a).id)), total),
    onDragCancel: ({ active: a }) => reorderWords.cancelled(titleOf(a.id), order.indexOf(Number(a.id)), total),
  };

  const overlayFilm = active && !active.keyboard ? byId.get(active.id) : undefined;
  const busy = saving !== null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // Scroll up or down near an edge, never sideways.
      autoScroll={{ threshold: { x: 0, y: 0.2 } }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move a film, press space to pick it up. Use the up and down arrows to move it, space to drop it, or escape to put it back.",
        },
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {active?.keyboard ? (
        // Shown while a film is lifted by the keyboard; the live region speaks the moves.
        <Notice title={`Moving ${titleOf(active.id)}.`} className="mb-4">
          Position {overIndex + 1} of {total}. <kbd className={searchKbd}>↑</kbd>{" "}
          <kbd className={searchKbd}>↓</kbd> to move, <kbd className={searchKbd}>space</kbd> to drop,{" "}
          <kbd className={searchKbd}>esc</kbd> to cancel.
        </Notice>
      ) : null}
      <div aria-busy={busy || undefined}>
        <FilmList head={head} columns={columns} handles>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((id) => {
              const film = byId.get(id);
              if (!film) return null;
              return (
                <SortableRow
                  key={id}
                  film={film}
                  disabled={busy}
                  handleState={
                    saving?.id === id && saving.ring
                      ? "saving"
                      : saving?.ring
                        ? "paused"
                        : failed === id
                          ? "failed"
                          : "resting"
                  }
                  keyboard={active?.id === id && active.keyboard}
                />
              );
            })}
          </SortableContext>
          <DragOverlay modifiers={[upAndDownOnly]} dropAnimation={{ duration: 200, easing: EASE }}>
            {overlayFilm ? (
              <div className={cn(lifted, "cursor-grabbing")}>
                <HandleContext value={{ title: overlayFilm.title, state: "lifted" }}>{overlayFilm.row}</HandleContext>
              </div>
            ) : null}
          </DragOverlay>
        </FilmList>
      </div>
    </DndContext>
  );
}

function SortableRow({
  film,
  disabled,
  handleState,
  keyboard,
}: {
  film: SortableFilm;
  disabled: boolean;
  handleState: HandleState;
  keyboard: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: film.id,
    disabled,
    transition: { duration: 200, easing: EASE },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // A keyboard lift moves the row itself (lifted look, handle focused); a pointer lift leaves a slot.
      className={cn(isDragging && (keyboard ? lifted : slot))}
    >
      <HandleContext
        value={{
          title: film.title,
          state: isDragging ? (keyboard ? "keyboard" : "lifted") : handleState,
          ref: setActivatorNodeRef,
          props: { ...attributes, ...listeners },
        }}
      >
        {film.row}
      </HandleContext>
    </div>
  );
}
