"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { setFavorite } from "@/app/actions/watch-list";
import { showToast } from "@/components/toast/Toaster";
import { cn } from "@/lib/cn";

export function StarButton({ movieId, title, favorite, markVersion }: {
  movieId: number;
  title: string;
  favorite: boolean;
  markVersion: string;
}) {
  const router = useRouter();
  const [pendingStar, setPendingStar] = useState<boolean | null>(null);
  const [refreshing, startTransition] = useTransition();
  const inFlight = useRef(false);
  const saving = pendingStar !== null || refreshing;
  const starred = pendingStar ?? favorite;

  // A tap saves what the row shows, so it needs no version: a Queue, drag or bookmark save on the
  // same row changes the version without touching the star. Try again repeats the same intent with
  // the version read before the first try, so it can't undo a star changed elsewhere since (11.R).
  const save = async (retry = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const next = !favorite;
    setPendingStar(next);
    let saved = false;
    try {
      saved = (await setFavorite(movieId, next, retry ? markVersion : undefined)).ok;
    } catch {
      // A lost response may still have saved. Read the lists again below.
    } finally {
      inFlight.current = false;
    }
    if (saved) {
      startTransition(() => {
        router.refresh();
        setPendingStar(null);
      });
    } else {
      setPendingStar(null);
      startTransition(() => router.refresh());
      showToast({
        title: next ? `Couldn't star ${title}` : `Couldn't unstar ${title}`,
        description: "Check the connection and try again.",
        onRetry: () => save(true),
      });
    }
  };

  return (
    <button
      type="button"
      onClick={() => save()}
      disabled={saving}
      aria-busy={saving || undefined}
      aria-label={`Star ${title}`}
      aria-pressed={starred}
      className={cn(
        "group relative mt-1 inline-flex min-h-7 items-start gap-1 rounded-pill border border-transparent py-1 pr-1.5 pl-2 text-caption whitespace-nowrap outline-none",
        "transition-[border-color] duration-[var(--dur-fast)] ease-app hover:border-line-strong focus-visible:shadow-focus",
        "disabled:cursor-default disabled:text-ink-faint disabled:hover:border-transparent",
        "before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']",
        starred ? "text-gold-ink" : "text-ink-muted",
      )}
    >
      <Star aria-hidden="true" strokeWidth={1.75} className={cn(
        "mt-[3px] size-3.5 flex-none group-disabled:text-ink-faint",
        starred ? "fill-gold text-gold-ink group-disabled:fill-ink-faint" : "text-ink-subtle",
      )} />
      <span className="grid">
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">Starred</span>
        <span className="col-start-1 row-start-1">{starred ? "Starred" : "Star"}</span>
      </span>
    </button>
  );
}
