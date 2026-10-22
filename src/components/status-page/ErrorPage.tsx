import { RotateCw } from "lucide-react";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/button/Button";
import { StatusPage } from "./StatusPage";

/** Guide §8.11: a page failed to load. `reference` and `time` are the caption's two parts. */
export function ErrorPage({
  onRetry,
  reference,
  time,
  headingLevel,
  className,
}: {
  onRetry?: () => void;
  /** The error's digest, where the server gave one. */
  reference?: string;
  /** "22 Oct 2026, 08:14". Unset until the browser has it (so server and browser agree). */
  time?: string;
  headingLevel?: 1 | 2;
  className?: string;
}) {
  const parts = [reference ? `Reference: ${reference}` : null, time].filter(Boolean);
  return (
    <StatusPage
      className={className}
      headingLevel={headingLevel}
      eyebrow="Something went wrong"
      title="This page didn't load"
      sub="It's probably a passing problem with the connection or the database. Your marks are safe."
      actions={
        <>
          <Button variant="primary" onClick={onRetry}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} />
            Try again
          </Button>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Go to the race
          </Link>
        </>
      }
      detail={parts.length > 0 ? parts.join(" · ") : undefined}
    />
  );
}
