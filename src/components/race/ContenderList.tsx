import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

/** The rows: the first rule in ink, and a closing rule under the last (drop it when a "Show all" row follows: it has its own rule). */
export function ContenderList({ children, className, ref }: { children: ReactNode; className?: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={cn("border-b border-line [&>*:first-child]:border-t-ink", className)}>
      {children}
    </div>
  );
}
