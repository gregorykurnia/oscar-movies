import { AlertCircle, Info, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/button/Button";
import { cn } from "@/lib/cn";

export type ToastTone = "error" | "info";

export type ToastProps = {
  tone?: ToastTone;
  /** "Couldn't save" */
  title: string;
  /** "Hamnet is back to not watched. Check the connection and try again." */
  description?: string;
  /** Replaces the tone's icon (the info toast for an added film shows a check). */
  icon?: LucideIcon;
  /** Shows the ghost "Try again" button. */
  onRetry?: () => void;
  onClose?: () => void;
  className?: string;
};

/**
 * Guide §7 Toast: only for failures (and the odd neutral note); successes need none.
 * Stays until closed or retried. Placement is the Toaster's job.
 */
export function Toast({ tone = "error", title, description, icon, onRetry, onClose, className }: ToastProps) {
  const Icon = icon ?? (tone === "error" ? AlertCircle : Info);
  return (
    <div
      role="status"
      data-tone={tone}
      className={cn(
        "flex w-full items-start gap-3 rounded-md bg-surface py-3.5 pr-3.5 pl-4 text-small text-ink shadow-toast md:w-[380px]",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-px size-[18px] flex-none", tone === "error" ? "text-error" : "text-ink-muted")}
        strokeWidth={1.75}
      />
      <div className="min-w-0 flex-1">
        <strong className="block font-medium">{title}</strong>
        {description ? <span className="text-ink-muted">{description}</span> : null}
      </div>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
      {onClose ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-mt-1 -mr-1 grid size-7 flex-none place-items-center rounded-sm text-ink-muted outline-none hover:bg-track hover:text-ink focus-visible:shadow-focus"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}
