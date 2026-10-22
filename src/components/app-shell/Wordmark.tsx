import Link from "next/link";
import { cn } from "@/lib/cn";

/** The mark (guide §10): an abstract statuette in gold on an ink square, radius 8 of 32. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={cn("size-[26px] flex-none", className)}>
      <rect width="32" height="32" rx="8" fill="var(--ink)" />
      <circle cx="16" cy="8.4" r="2.7" fill="var(--gold)" />
      <path d="M13.3 12.3h5.4l-1.05 10.9h-3.3z" fill="var(--gold)" />
      <rect x="10.6" y="24.3" width="10.8" height="2.6" rx="1.3" fill="var(--gold)" />
    </svg>
  );
}

/** The wordmark: the mark at 26px and "Oscar Movies" in 600 16px, 10px apart. Links to the race. */
export function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-sm text-[16px] font-semibold tracking-[-0.01em] whitespace-nowrap text-ink outline-none focus-visible:shadow-focus"
    >
      <Logo />
      Oscar Movies
    </Link>
  );
}
