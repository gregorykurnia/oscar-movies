import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AccuracyRow } from "./accuracy-page";
import { buildSignals, strongKinds, type SignalEdition, type Signals } from "./signals";
import type { Outcome } from "./stage";

type Film = { id: number; title: string };
type Fixture = {
  today: string;
  films: Film[];
  oscar: Record<string, Outcome>;
  rows: AccuracyRow[];
  editions: Record<string, SignalEdition>;
  expected: unknown;
};

const fixture = JSON.parse(readFileSync("tests/fixtures/signals-documentary.json", "utf8")) as Fixture;

function build(f: Fixture = fixture): Signals<Film> {
  return buildSignals({
    rows: f.rows,
    editions: new Map(Object.entries(f.editions)),
    films: new Map(f.films.map((film) => [film.id, film])),
    oscar: new Map(Object.entries(f.oscar).map(([id, o]) => [Number(id), o])),
    today: f.today,
  });
}

/** The views in the fixture's short form: keys, titles and "hits/count". */
function summarise(s: Signals<Film>) {
  const fig = (f: { hits: number; count: number }) => `${f.hits}/${f.count}`;
  return {
    byAward: s.byAward.map((a) => ({
      key: a.row.key,
      kinds: a.kinds.map((k) => `${k.kind} ${fig(k.figure)}`),
      films: a.films?.map((f) => `${f.film.title} ${f.outcome} (oscar ${f.oscar ?? "none"})`) ?? null,
      next: a.next ? `${a.next.what} ${a.next.on}` : null,
    })),
    byFilm: s.byFilm.map((f) => ({
      film: f.film.title,
      oscar: f.oscar,
      picks: f.picks.map((p) => `${p.row.key} ${p.outcome} ${p.kind} ${fig(p.figure)}`),
    })),
    pending: s.pending.map((a) => a.row.key),
  };
}

describe("the hand-worked fixture (made-up Documentary awards, 2025)", () => {
  it("matches the expected views exactly", () => {
    expect(summarise(build())).toEqual(fixture.expected);
  });
});

describe("strongKinds", () => {
  const row = (caught: [number, number] | null, nomination: [number, number], years: number) => ({
    caught: caught && { hits: caught[0], count: caught[1] },
    nomination: { hits: nomination[0], count: nomination[1] },
    years,
  });

  it("takes exactly 50% caught and exactly 80% winner as strong", () => {
    expect(strongKinds(row([5, 10], [8, 10], 5))).toEqual(["caught", "winner"]);
  });

  it("stops just under either line", () => {
    expect(strongKinds(row([49, 100], [79, 100], 14))).toEqual([]);
  });

  it("needs at least 5 counted years", () => {
    expect(strongKinds(row([10, 10], [4, 4], 4))).toEqual([]);
  });

  it("skips a figure with nothing counted or none at all", () => {
    expect(strongKinds(row([0, 0], [0, 0], 10))).toEqual([]);
    expect(strongKinds(row(null, [9, 10], 10))).toEqual(["winner"]);
  });
});

describe("the next date of an award that hasn't announced", () => {
  it("drops a date that has already passed", () => {
    const signals = build({ ...fixture, today: "2026-02-01" });
    const bafta = signals.pending.find((a) => a.row.key === "bafta/documentary")!;
    expect(bafta.next).toEqual({ what: "winner", on: "2026-02-22" });
  });

  it("lists nothing from a no-data edition", () => {
    const editions = { ...fixture.editions, "ida/feature": { ...fixture.editions["ida/feature"], status: "no_data" as const } };
    const ida = build({ ...fixture, editions }).byAward.find((a) => a.row.key === "ida/feature")!;
    expect(ida.films).toBeNull();
  });
});
