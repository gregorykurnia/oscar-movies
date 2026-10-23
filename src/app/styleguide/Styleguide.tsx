import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { BOARDS, Components } from "./components";
import { Foundations } from "./foundations";
import { Part, PartIntro } from "./parts";
import { sample } from "./sample";

/**
 * Guide §14: every component in every state, drawn by the real components, in the order of the
 * preview's §2 (foundations) and §3 (components). The stress switch is in the address (`?stress=1`).
 */
export function Styleguide({ stress, tokens }: { stress: boolean; tokens: Record<string, string> }) {
  const s = sample(stress);
  return (
    <>
      <PageHeader
        title="Styleguide"
        sub="Every component built so far, in every state. Compare each board with design-preview.html."
        actions={
          <Segmented
            label="Data"
            items={[
              { label: "Normal", href: "/styleguide", current: !stress },
              { label: "Stress", href: "/styleguide?stress=1", current: stress },
            ]}
          />
        }
      />
      <p className="mt-5 max-w-[820px] text-small text-ink-muted">
        {stress
          ? "Stress data is on: titles with no spaces, the longest real titles, huge counts and missing scores."
          : "Stress data swaps in titles with no spaces, the longest real titles, huge counts and missing scores."}{" "}
        Light only; resize the window for the phone layout (760px and under). Hover, focus and press are live. This page is closed on the live site.
      </p>

      <nav aria-label="Components on this page" className="mt-8 grid gap-x-8 gap-y-2 border-t border-line pt-5 text-caption md:grid-cols-2">
        {BOARDS.map((board) => (
          <a
            key={board.id}
            href={`#${board.id}`}
            className="group rounded-xs outline-none focus-visible:shadow-focus"
          >
            <span className="font-medium group-hover:underline group-hover:underline-offset-[3px]">{board.title}</span>
            <span className="text-ink-muted"> · {board.components.join(", ")}</span>
          </a>
        ))}
      </nav>

      <Part id="foundations" title="Foundations">
        <PartIntro>
          Tokens from guide §3, drawn. Warm white paper, stone greys, one gold. The only other hue is the error red, and the flags.
        </PartIntro>
        <Foundations tokens={tokens} longWord={stress ? s.longWord : undefined} />
      </Part>

      <Part id="components" title="Components">
        <PartIntro>
          Every component and its states, from the real components. The chance line and the year grid arrive with the pages that need them.
        </PartIntro>
        <Components s={s} />
      </Part>
    </>
  );
}
