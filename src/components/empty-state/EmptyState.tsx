import { Calendar, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Guide §7 Empty state: a dashed box with a gold-wash circle and icon, a title, one or two
 * sentences saying what's missing and when it comes (§11), and optional actions.
 */
export function EmptyState({
  title,
  children,
  icon: Icon = Calendar,
  actions,
  headingLevel = 2,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  /** The heading's level in the page outline (2 under the PageHeader's h1). */
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-line-strong px-8 py-12 text-center",
        className,
      )}
    >
      <div className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-gold-wash text-gold-ink">
        <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      </div>
      <Heading className="text-[17px] font-medium">{title}</Heading>
      {children ? <p className="mx-auto mt-1.5 max-w-[46ch] text-small text-ink-muted">{children}</p> : null}
      {actions ? <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
