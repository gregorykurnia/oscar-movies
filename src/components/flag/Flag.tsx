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
 * A film's flags: main country first (for International Feature, the submitting country first),
 * up to three, then "+N". Stacked in race rows and film lists, in a line elsewhere.
 */
export function Flags({
  codes,
  size = "md",
  stacked = false,
  max = 3,
  firstLabel,
  className,
}: {
  codes: string[];
  size?: FlagSize;
  stacked?: boolean;
  max?: number;
  /** Accessible name for the first flag, e.g. "Brazil, submitting country". */
  firstLabel?: string;
  className?: string;
}) {
  if (codes.length === 0) return null;
  const shown = codes.slice(0, max);
  const hidden = codes.slice(max);
  return (
    <span
      className={cn(
        "inline-flex gap-[3px]",
        stacked ? "flex-col items-start" : "items-center",
        className,
      )}
    >
      {shown.map((code, i) => (
        <Flag key={`${code}-${i}`} code={code} size={size} label={i === 0 ? firstLabel : undefined} />
      ))}
      {hidden.length > 0 ? (
        <span
          className="ml-0.5 text-micro leading-none text-ink-muted"
          aria-label={`and ${hidden.map(countryName).join(", ")}`}
          title={hidden.map(countryName).join(", ")}
        >
          +{hidden.length}
        </span>
      ) : null}
    </span>
  );
}
