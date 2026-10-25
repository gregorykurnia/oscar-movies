import { FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { StagePill } from "@/components/stage-pill/StagePill";
import type { PatternFilmLink } from "@/data/patterns";
import type { FilmPatterns, Reason } from "@/lib/patterns";
import { formatChance } from "@/lib/race-chances";
import { reasonText, snubRiskText } from "@/lib/patterns/words";
import { Caption, HitPill, OutlineTag, RiskLine, SnubRiskFlag } from "./Pieces";

// The patterns page's Film rows (guide §8.14): one builder per list, all on the same Film row.

/** Columns of the five's lists: the film (result pills in its title line), then the marks. */
export const PICK_COLUMNS = ["minmax(0,1fr)", "72px"];
/** The live year's list: the film, "To be nominated", the marks. */
export const LIVE_COLUMNS = ["minmax(0,1fr)", "112px", "84px"];
export const CONTENDER_COLUMNS = ["minmax(0,1fr)", "84px"];
export const MISS_COLUMNS = ["minmax(0,1fr)", "minmax(0,1.25fr)", "84px"];

type Rowfilm = { film: FilmPatterns; link: PatternFilmLink };

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const flagged = (f: FilmPatterns) => f.snubRisk.length > 0;

function common({ link }: { link: PatternFilmLink }) {
  return {
    title: link.title,
    href: `/movies/${link.slug}`,
    flag: link.flag,
    scores: link.scores,
    marks: <FilmMarks movieId={link.id} title={link.title} />,
    headingLevel: 3 as const,
  };
}

/** The first reason that is its pattern, as the caption's lead: "3+ strong awards, not US-only: 18 of 18 nominated". */
const patternReason = (f: FilmPatterns) => reasonText(f.reasons.find((r): r is Extract<Reason, { kind: "pattern" }> => r.kind === "pattern")!);
const nominationsReason = (f: FilmPatterns) => reasonText(f.reasons.find((r): r is Extract<Reason, { kind: "nominations" }> => r.kind === "nominations")!);

/** The tags that end a caption: Underdog where it applies, Snub risk where the film was flagged. */
function Tags({ film }: { film: FilmPatterns }) {
  return (
    <>
      {film.underdog ? <OutlineTag kind="underdog">Underdog</OutlineTag> : null}
      {flagged(film) ? <SnubRiskFlag /> : null}
    </>
  );
}

/** "What the patterns picked": ranked, with Nominated or Not nominated (and Won). */
export function PickedRow({ film, link, won }: Rowfilm & { won: boolean }) {
  const row = common({ link });
  return (
    <FilmRow
      {...row}
      rank={film.pick ?? undefined}
      winner={won}
      badge={
        <>
          {won ? <StagePill stage="won" /> : null}
          <HitPill hit={film.nominated === true}>{film.nominated ? "Nominated" : "Not nominated"}</HitPill>
        </>
      }
      note={
        <Caption>
          <span>{patternReason(film)}</span>
          <Tags film={film} />
        </Caption>
      }
      results={[]}
    />
  );
}

/** "What the Oscars nominated": the winner first, with Picked #4 or Not picked, ranked 8. */
export function NomineeRow({ film, link, won, slots }: Rowfilm & { won: boolean; slots: number }) {
  const row = common({ link });
  const picked = film.pick !== null && film.pick <= slots;
  return (
    <FilmRow
      {...row}
      winner={won}
      badge={
        <>
          {won ? <StagePill stage="won" /> : null}
          <HitPill hit={picked}>{picked ? `Picked #${film.pick}` : `Not picked, ranked ${film.pick ?? "–"}`}</HitPill>
        </>
      }
      note={
        <Caption>
          <span>{nominationsReason(film)}</span>
          <Tags film={film} />
        </Caption>
      }
      results={[]}
    />
  );
}

/** The live year (and before the shortlist): rank, caption, "To be nominated" and the flag's reasons. */
export function ContenderRow({ film, link, percent }: Rowfilm & { percent: boolean }) {
  const row = common({ link });
  return (
    <FilmRow
      {...row}
      rank={film.pick ?? undefined}
      note={
        <>
          <Caption>
            <span>
              {patternReason(film)} · {nominationsReason(film)}
            </span>
            {flagged(film) ? <SnubRiskFlag /> : null}
          </Caption>
          {film.snubRisk.map((risk) => (
            <RiskLine key={risk.sign} className="mt-1.5">
              {capital(snubRiskText(risk))}.
            </RiskLine>
          ))}
        </>
      }
      results={
        percent && film.pNominate !== null
          ? [{ label: "To be nominated", value: `${formatChance(film.pNominate)}%`, numeric: true }]
          : []
      }
    />
  );
}

/** "Why they missed": the film, and its reasons one to a line, the Snub risk reasons last. */
export function MissRow({ film, link }: Rowfilm) {
  const row = common({ link });
  // The snub rule's reason is the Snub risk "busy" sign's text: say it once, with its icon.
  const reasons = film.reasons.filter((r) => !(r.kind === "snub-rule" && film.snubRisk.some((s) => s.sign === "busy")));
  return (
    <FilmRow
      {...row}
      note={
        <Caption>
          <span>{film.pick !== null ? `Pick #${film.pick}` : "Not picked"}</span>
          {flagged(film) ? <SnubRiskFlag /> : null}
        </Caption>
      }
      results={[
        {
          label: "Why it missed",
          block: true,
          value: (
            <ul data-reasons className="mt-0.5 grid gap-1.5 text-small text-ink-muted md:mt-0">
              {reasons.map((r, i) => (
                <li key={r.kind} className={i === 0 ? "text-ink" : undefined}>
                  {capital(reasonText(r))}.
                </li>
              ))}
              {film.snubRisk.map((risk) => (
                <li key={risk.sign} className="list-none">
                  <RiskLine className="text-small">{capital(snubRiskText(risk))}.</RiskLine>
                </li>
              ))}
            </ul>
          ),
        },
      ]}
    />
  );
}
