"use client";

import { ListMinus, ListPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setQueued } from "@/app/actions/watch-list";
import { showToast } from "@/components/toast/Toaster";
import { cn } from "@/lib/cn";

// Guide §8.3 "Watch queue" (owner, 2026-11-17): on a Want to watch row "Queue" puts the film in
// the Watch queue; on a queue row "Remove from queue" sends it back to the top of Want to watch.
// It sits beside the release line in the same quiet pill style. The lists are read on the
// server, so a saved change reads the page again; a failure leaves it as it was and says so.

export function QueueButton({ movieId, title, queued }: { movieId: number; title: string; queued: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const save = () => {
    if (saving) return;
    setSaving(true);
    const failed = () => {
      setSaving(false);
      showToast({
        title: queued ? `Couldn't take ${title} out of the queue` : `Couldn't add ${title} to the queue`,
        description: "Your lists are as they were. Check the connection and try again.",
        onRetry: save,
      });
      // It may have been unmarked in another tab: read the lists again.
      startTransition(() => router.refresh());
    };
    setQueued(movieId, !queued).then(
      (result) => {
        if (!result.ok) return failed();
        startTransition(() => {
          router.refresh();
          setSaving(false);
        });
      },
      failed,
    );
  };

  const Icon = queued ? ListMinus : ListPlus;
  return (
    <button
      type="button"
      onClick={save}
      disabled={saving}
      aria-busy={saving || undefined}
      aria-label={queued ? `Remove ${title} from the watch queue` : `Add ${title} to the watch queue`}
      className={cn(
        "relative mt-1 inline-flex min-h-7 items-start gap-1.5 rounded-pill border border-transparent py-1 pr-2.5 pl-2 text-caption text-ink-muted outline-none",
        "transition-[border-color] duration-[var(--dur-fast)] ease-app hover:border-line-strong focus-visible:shadow-focus",
        "disabled:cursor-default disabled:text-ink-faint disabled:hover:border-transparent",
        // A 44px hit area around the 28px line.
        "before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']",
      )}
    >
      {saving ? (
        <span aria-hidden="true" className="mt-[3px] size-3.5 flex-none animate-spin rounded-full border-2 border-gold border-r-transparent" />
      ) : (
        <Icon aria-hidden="true" className="mt-[3px] size-3.5 flex-none text-ink-subtle" strokeWidth={1.75} />
      )}
      <span>{queued ? "Remove from queue" : "Queue"}</span>
    </button>
  );
}
