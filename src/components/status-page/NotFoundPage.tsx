import { Search } from "lucide-react";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/button/Button";
import { StatusPage, usefulLinks } from "./StatusPage";

/** Guide §8.11: any unknown address, year or award. */
export function NotFoundPage({
  season,
  toWatch,
  headingLevel,
  className,
}: {
  season?: number;
  toWatch?: number;
  headingLevel?: 1 | 2;
  className?: string;
}) {
  return (
    <StatusPage
      className={className}
      headingLevel={headingLevel}
      eyebrow="Error 404"
      title="This page isn't here"
      sub="The link may be old, or that year or award isn't in the app."
      actions={
        <>
          <Link href="/" className={buttonClasses({ variant: "primary" })}>
            Go to the race
          </Link>
          {/* Inert until 1.12, like the top bar's search. */}
          <Button variant="secondary" disabled>
            <Search aria-hidden="true" strokeWidth={1.75} />
            Search
          </Button>
        </>
      }
      links={usefulLinks({ season, toWatch })}
    />
  );
}
