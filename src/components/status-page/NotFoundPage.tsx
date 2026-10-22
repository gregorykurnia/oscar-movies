import Link from "next/link";
import { buttonClasses } from "@/components/button/Button";
import { OpenSearchButton } from "@/components/search/OpenSearchButton";
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
          <OpenSearchButton />
        </>
      }
      links={usefulLinks({ season, toWatch })}
    />
  );
}
