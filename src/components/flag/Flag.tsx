import * as flagArt from "country-flag-icons/react/3x2";
import { cn } from "@/lib/cn";

// Every flag's artwork is in this import, so Flag stays a server component: pages render it on
// the server and only the SVG reaches the browser. A client component that needs flags should
// receive them rendered (as children) rather than import Flag.

export type FlagSize = "sm" | "md" | "lg";

// Guide §7 Flags: 15×10 in tabs, 21×14 in rows, 30×20 on the movie page; radius 2 (3 large).
const sizes: Record<FlagSize, string> = {
  sm: "h-2.5 w-[15px] rounded-xs",
  md: "h-3.5 w-[21px] rounded-xs",
  lg: "h-5 w-[30px] rounded-[3px]",
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** The country's English name ("Brazil") from its ISO 3166-1 alpha-2 code; the code if unknown. */
export function countryName(code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

type FlagComponent = (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;

export function Flag({
  code,
  size = "md",
  label,
  className,
}: {
  /** ISO 3166-1 alpha-2, any case. */
  code: string;
  size?: FlagSize;
  /** Accessible name; defaults to the country name ("Brazil, submitting country" where it helps). */
  label?: string;
  className?: string;
}) {
  const Art = (flagArt as unknown as Record<string, FlagComponent | undefined>)[code.toUpperCase()];
  return (
    <span
      role="img"
      aria-label={label ?? countryName(code)}
      className={cn(
        // The 1px inset edge sits over the artwork so white flags show on paper.
        "relative block flex-none overflow-hidden bg-track after:absolute after:inset-0 after:rounded-[inherit] after:shadow-flag-edge after:content-['']",
        sizes[size],
        className,
      )}
    >
      {Art ? <Art aria-hidden="true" focusable="false" className="block size-full" preserveAspectRatio="xMidYMid slice" /> : null}
    </span>
  );
}

/**
 * The accessible name of a film's flag in an International row: "Brazil, submitting country" when
 * the row's submitting country is the flag shown, otherwise the plain country name.
 */
export function submittingLabel(flag: string | null, submittedBy: string | null): string | undefined {
  if (!flag || !submittedBy || flag.toUpperCase() !== submittedBy.toUpperCase()) return undefined;
  return `${countryName(flag)}, submitting country`;
}

/**
 * A film's one flag (guide §7 Flags): its primary country, or nothing for a film with none.
 * Never several flags and never "+N"; the other countries are named in text on the movie page.
 */
export function Flags({
  code,
  size = "md",
  label,
  className,
}: {
  code: string | null | undefined;
  size?: FlagSize;
  /** Accessible name, e.g. "Brazil, submitting country" (`submittingLabel`). */
  label?: string;
  className?: string;
}) {
  if (!code) return null;
  return <Flag code={code} size={size} label={label} className={className} />;
}
