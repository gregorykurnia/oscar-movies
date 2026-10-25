import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Notice } from "@/components/notice/Notice";
import { StagePill } from "@/components/stage-pill/StagePill";
import { TextLink } from "@/components/text-link/TextLink";
import type { NominationPanel } from "@/lib/patterns/movie";
import { SNUB_RISK_LABEL } from "@/lib/patterns/words";

/**
 * Guide §8.6 Nomination patterns (v1.2): for a film shortlisted in Documentary or International,
 * its pattern and how films with it did before, the patterns' pick, its Oscar result and, when
 * flagged, the Snub risk notice with each sign's reason and figure, then a link to the year's page.
 */
export function NominationPatterns({ panel }: { panel: NominationPanel }) {
  const id = `patterns-${panel.year}-${panel.category}`;
  const { flag } = panel;
  return (
    <section aria-labelledby={`${id}-h ${id}-sub`} data-panel={panel.category} className="mt-10 md:mt-14">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-h`} className="text-section-phone leading-tight font-medium tracking-heading md:text-section">
          Nomination patterns
        </h2>
        <span id={`${id}-sub`} className="text-small text-ink-muted">
          {panel.year} · {panel.categoryName}
        </span>
      </div>
      <ul className="border-b border-line">
        {panel.pattern ? (
          <Row label="Pattern">
            <span className="text-ink">{panel.pattern.label}</span>
            <span className="text-ink-muted"> · {panel.pattern.record}</span>
          </Row>
        ) : null}
        {panel.pick ? (
          <Row label="The patterns' pick">
            <span className="font-medium">
              Pick #{panel.pick.rank} of {panel.pick.of}
            </span>
          </Row>
        ) : null}
        <Row label="Oscar result">
          <StagePill stage={panel.stage} />
        </Row>
      </ul>
      {flag ? (
        <Notice
          tone="neutral"
          icon={CircleAlert}
          className="mt-4"
          title={`${SNUB_RISK_LABEL}${
            flag.result === "missed" ? " · Flagged, and missed" : flag.result === "got-in" ? " · Flagged, and got in anyway" : ""
          }`}
        >
          {flag.signs.map((s) => (
            <span key={s} data-risk-reason className="mt-1 block first:mt-1.5">
              {s}
            </span>
          ))}
        </Notice>
      ) : null}
      {panel.href ? (
        <p className="mt-4 text-small">
          <TextLink href={panel.href}>All of {panel.year}&rsquo;s nomination patterns</TextLink>
        </p>
      ) : null}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="grid gap-x-4 gap-y-1 border-t border-line py-3.5 text-small first:border-t-ink md:grid-cols-[168px_minmax(0,1fr)] md:items-center">
      <span className="text-ink-muted">{label}</span>
      <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
    </li>
  );
}
