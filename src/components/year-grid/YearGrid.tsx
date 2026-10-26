import { Check } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { Flags } from "@/components/flag/Flag";
import { FilmWatchedMark } from "@/components/marks/MarksProvider";
import { cn } from "@/lib/cn";
import {
  awardRuns,
  averageLine,
  cellKind,
  cellLabel,
  columnKey,
  criticsLabel,
  criticsWins,
  gridGroups,
  gridTotals,
  hasNoData,
  oscarGroupLabel,
  type CellKind,
  type GridCategory,
  type GridColumn,
  type GridFilm,
} from "@/lib/year-grid";

// Guide §7 Year grid cells. Picture can reach about 100 rows × 80 columns (plan §5.7), so every
// cell is one span with a data attribute, styled once from the table (and the legend) rather than
// carrying its own class list.
const cellLook = cn(
  "[&_[data-c]]:inline-grid [&_[data-c]]:place-items-center [&_[data-c]]:rounded-sm [&_[data-c]]:align-middle [&_[data-c]]:font-medium",
  "[&_[data-c=won]]:bg-gold [&_[data-c=won]]:text-on-gold",
  "[&_[data-c=nom]]:bg-gold-wash [&_[data-c=nom]]:inset-ring [&_[data-c=nom]]:inset-ring-gold-soft",
  "[&_[data-c=short]]:inset-ring [&_[data-c=short]]:inset-ring-line-strong",
  "[&_[data-c=sub]]:before:size-1.5 [&_[data-c=sub]]:before:rounded-full [&_[data-c=sub]]:before:bg-line-strong [&_[data-c=sub]]:before:content-['']",
  "[&_[data-c=cnt]]:bg-track [&_[data-c=cnt]]:px-2 [&_[data-c=cnt]]:text-ink [&_[data-c=cnt]]:whitespace-nowrap",
  "[&_[data-c=none]]:text-ink-faint",
);

const tableLook = cn(
  "min-w-full border-separate border-spacing-0 text-caption",
  // Rules: one under every row, one between groups ([data-gs]).
  "[&_td]:border-b [&_td]:border-line [&_th]:border-b [&_th]:border-line [&_tbody_tr:last-child>*]:border-b-0",
  "[&_[data-gs]]:border-l",
  // Column heads: micro, ink-muted, one line.
  "[&_thead_th]:h-[34px] [&_thead_th]:bg-surface [&_thead_th]:px-0.5 [&_thead_th]:text-center [&_thead_th]:text-micro [&_thead_th]:font-normal [&_thead_th]:whitespace-nowrap [&_thead_th]:text-ink-muted",
  // Award cells: 44×48 on phone, 52×52 from md.
  "[&_tbody_td]:h-12 [&_tbody_td]:min-w-11 [&_tbody_td]:p-0 [&_tbody_td]:text-center md:[&_tbody_td]:h-[52px] md:[&_tbody_td]:min-w-[52px]",
  "[&_[data-tot]]:text-small [&_[data-w]]:font-medium [&_[data-w]]:text-gold-ink",
  "[&_tbody_tr:hover>*]:bg-paper",
  cellLook,
  "[&_[data-c]]:h-7 [&_[data-c]]:min-w-7 [&_[data-c]_svg]:size-3.5",
);

// A head spanning both head rows sits on the lower one, level with a split award's category heads.
const bottomHead = "!align-bottom !pb-[7px]";

// The film column stays put while the awards scroll (280px; 168px without flags on phone).
const filmCell =
  "sticky left-0 z-[1] w-[168px] min-w-[168px] max-w-[168px] border-r border-line bg-surface pr-2 pl-4 text-left " +
  "md:w-[280px] md:min-w-[280px] md:max-w-[280px] md:pr-3 md:pl-3.5";

/**
 * Guide §8.4 the year grid: a real table in a bordered frame that scrolls sideways (edge to edge on
 * phone), the film column sticky. A group row (Totals, Oscars, Major awards, Festivals, Critics
 * groups) sits over the column names; thin rules separate the groups. A split award's name spans its
 * categories' heads, a row lower, with rules either side of the run. Critics groups are one count
 * column unless `criticsOpen`. Every cell has a text label. Rendered on the server; only the
 * watched marks are client components.
 */
export function YearGrid({
  columns,
  films,
  category,
  criticsOpen,
  caption,
  oscarGroups = false,
}: {
  columns: GridColumn[];
  /** Already filtered and sorted. */
  films: GridFilm[];
  category: GridCategory;
  criticsOpen: boolean;
  caption: string;
  /** The Oscar order: a group row heads each Oscar group that has films (guide §8.4, v1.1). */
  oscarGroups?: boolean;
}) {
  const groups = gridGroups(columns).map((g) => ({
    ...g,
    folded: !criticsOpen && g.columns[0].kind === "critics",
    runs: awardRuns(g.columns),
  }));
  // A split award's run puts its categories' heads on a row of their own; the other heads span both rows.
  const subRow = groups.some((g) => !g.folded && g.runs.some((r) => r[0].sub));
  const headSpan = subRow ? 2 : undefined;
  // A rule before a group's first column and on either side of a split award's run.
  const ruled = (cols: GridColumn[], i: number) =>
    i === 0 || (cols[i].slug !== cols[i - 1].slug && Boolean(cols[i].sub || cols[i - 1].sub));
  const awardColumns = groups.reduce((n, g) => n + (g.folded ? 1 : g.columns.length), 0);
  const labels = oscarGroups ? films.map(oscarGroupLabel) : [];
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);

  return (
    <div
      role="region"
      aria-label="Awards for each film"
      tabIndex={0}
      className="-mx-4 mt-6 overflow-x-auto border-y border-line bg-surface outline-none focus-visible:shadow-focus md:mx-0 md:rounded-md md:border-x"
    >
      <table className={tableLook}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <td className={cn(filmCell, "z-[2] !border-b-0")} />
            <GroupHead label="Totals" span={2} />
            {groups.map((g) => (
              <GroupHead key={g.label} label={g.label} span={g.folded ? 1 : g.columns.length} />
            ))}
          </tr>
          <tr>
            <th
              scope="col"
              rowSpan={headSpan}
              className={cn(filmCell, "z-[2] !pr-2 !pb-2 !pl-4 !text-left align-bottom md:!pr-3 md:!pl-3.5")}
            >
              Film
            </th>
            <th scope="col" rowSpan={headSpan} data-gs="" className={cn(subRow && bottomHead)}>
              Wins
            </th>
            <th scope="col" rowSpan={headSpan} className={cn(subRow && bottomHead)}>
              Noms
            </th>
            {groups.map((g) => {
              if (g.folded) {
                return (
                  <th key={g.label} scope="col" rowSpan={headSpan} data-gs="" className={cn("!px-2", subRow && bottomHead)}>
                    {new Set(g.columns.map((c) => c.slug)).size} groups
                  </th>
                );
              }
              let at = 0;
              return g.runs.map((run) => {
                const i = at;
                at += run.length;
                const c = run[0];
                return c.sub ? (
                  <th
                    key={c.slug}
                    scope="colgroup"
                    colSpan={run.length}
                    title={hasNoData(c) ? `${c.name}: no data this year` : c.name}
                    data-gs=""
                    className="!border-b-0 !px-2 !align-bottom"
                  >
                    <span className="block border-b border-line-strong pb-1">{c.shortName}</span>
                  </th>
                ) : (
                  <th
                    key={c.slug}
                    scope="col"
                    rowSpan={headSpan}
                    title={hasNoData(c) ? `${c.name}: no data this year` : c.name}
                    data-gs={ruled(g.columns, i) ? "" : undefined}
                    className={cn("!px-2", subRow && bottomHead)}
                  >
                    {c.shortName}
                  </th>
                );
              });
            })}
          </tr>
          {subRow ? (
            <tr>
              {groups.map((g) =>
                g.folded
                  ? null
                  : g.columns.map((c, i) =>
                      c.sub ? (
                        <th
                          key={columnKey(c)}
                          scope="col"
                          title={`${c.name}: ${c.sub.name}`}
                          data-gs={ruled(g.columns, i) ? "" : undefined}
                          className="!px-2"
                        >
                          {c.sub.shortName}
                        </th>
                      ) : null,
                    ),
              )}
            </tr>
          ) : null}
        </thead>
        <tbody>
          {films.map((f, index) => {
            const { wins, noms } = gridTotals(f);
            const label = labels[index];
            // The row's name is the film's title alone, so each cell reads "Anora, BAFTA, Won: Best Film".
            return (
              <Fragment key={f.film.id}>
                {label && label !== labels[index - 1] ? (
                  <tr>
                    <th
                      scope="rowgroup"
                      className={cn(filmCell, "!h-[34px] !border-b-line-strong !bg-paper py-1.5 align-middle text-micro font-medium text-ink-muted")}
                    >
                      {label}
                      <span className="ml-1.5 font-normal">{counts.get(label)}</span>
                    </th>
                    <td colSpan={awardColumns + 2} className="!h-[34px] !border-b-line-strong !bg-paper" />
                  </tr>
                ) : null}
                <tr>
                  <th scope="row" aria-label={f.film.title} className={cn(filmCell, "py-2.5 font-normal")}>
                    <div className="flex items-center gap-2.5">
                      <span className="hidden flex-none md:block">
                        <Flags code={f.film.flag} />
                      </span>
                      <span className="min-w-0 flex-1 text-small leading-[1.3] font-medium [overflow-wrap:anywhere]">
                        <Link
                          href={`/movies/${f.film.slug}`}
                          className="rounded-xs outline-none hover:underline hover:decoration-1 hover:underline-offset-[3px] focus-visible:shadow-focus"
                        >
                          {f.film.title}
                        </Link>
                        <span className="block text-micro font-normal text-ink-muted">{averageLine(f.film)}</span>
                      </span>
                      <FilmWatchedMark movieId={f.film.id} title={f.film.title} className="flex-none" />
                    </div>
                  </th>
                  <td data-tot="" data-w={wins > 0 ? "" : undefined} data-gs="">
                    {wins}
                  </td>
                  <td data-tot="">{noms}</td>
                  {groups.map((g) => {
                    if (g.folded) {
                      const n = criticsWins(f, g.columns);
                      return (
                        <td key={g.label} data-gs="">
                          {n > 0 ? <Cell kind="cnt" label={criticsLabel(n)}>{n}</Cell> : null}
                        </td>
                      );
                    }
                    return g.columns.map((c, i) => {
                      const cell = f.cells[columnKey(c)];
                      return (
                        <td key={columnKey(c)} data-gs={ruled(g.columns, i) ? "" : undefined}>
                          {cell ? (
                            <Cell kind={cellKind(cell.outcome)} label={cellLabel(cell, c, category)} />
                          ) : hasNoData(c) ? (
                            <Cell kind="none" label="No data">
                              –
                            </Cell>
                          ) : null}
                        </td>
                      );
                    });
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupHead({ label, span }: { label: string; span: number }) {
  return (
    <th
      scope="colgroup"
      colSpan={span}
      data-gs=""
      className="!h-[30px] !border-b-0 !pl-2.5 !text-left !font-medium !text-ink"
    >
      {label}
    </th>
  );
}

/** One cell: a 28px square with its label as title and accessible name; a won cell carries a check. */
function Cell({ kind, label, children }: { kind: CellKind | "cnt" | "none"; label: string; children?: React.ReactNode }) {
  return (
    <span data-c={kind} role="img" aria-label={label} title={label}>
      {kind === "won" ? <Check aria-hidden="true" strokeWidth={2.25} /> : children}
    </span>
  );
}

/** Guide §8.4 legend under the grid: the cell kinds in words. */
export function YearGridLegend({
  category,
  hasCritics,
  hasNoDataColumn,
}: {
  category: GridCategory;
  hasCritics: boolean;
  hasNoDataColumn: boolean;
}) {
  const items: { kind: CellKind | "cnt" | "none"; label: string; content?: string }[] = [
    { kind: "won", label: "Won" },
    { kind: "nom", label: "Nominated or on the list" },
    { kind: "short", label: "Oscar shortlist" },
    { kind: "sub", label: category === "international" ? "Submitted" : "Submitted or eligible" },
  ];
  if (hasCritics) items.push({ kind: "cnt", label: "Critics group wins", content: "9" });
  if (hasNoDataColumn) items.push({ kind: "none", label: "No data that year", content: "–" });
  return (
    <ul
      aria-label="Legend"
      className={cn(
        "mt-4 flex flex-wrap items-center gap-x-[18px] gap-y-2 text-caption text-ink-muted",
        cellLook,
        "[&_[data-c]]:h-5 [&_[data-c]]:min-w-5 [&_[data-c]]:text-micro [&_[data-c]_svg]:size-[11px]",
      )}
    >
      {items.map((item) => (
        <li key={item.kind} className="inline-flex items-center gap-2">
          <span data-c={item.kind} aria-hidden="true">
            {item.kind === "won" ? <Check strokeWidth={2.25} /> : item.content}
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
