// The restore planner's rules (IMPLEMENTATION_PLAN.md §3.5): no database, made-up films.
import { describe, expect, it } from "vitest";
import { exportProblem, formatPlan, planRestore, serializeMarks, type CurrentMark, type Film, type MarkState } from "./marks";

const ids = { tmdbId: null, localId: null };
const anora: Film = { ...ids, id: 1, slug: "anora", imdbId: "tt1", wikidataId: "Q1", title: "Anora", year: 2024 };
const conclave: Film = { ...ids, id: 2, slug: "conclave", imdbId: "tt2", wikidataId: "Q2", title: "Conclave", year: 2024 };
const noImdb: Film = { ...ids, id: 3, slug: "flow", imdbId: null, wikidataId: "Q3", title: "Flow", year: 2024 };
const films = [anora, conclave, noImdb];

const EMPTY = { wantRank: null, releaseOn: null, platform: null };
/** A row in `marks`; the Watch list fields default to empty. */
const row = (movieId: number, watched: boolean, want: boolean, extra: Partial<MarkState> = {}): CurrentMark => ({
  movieId,
  watched,
  want,
  ...EMPTY,
  ...extra,
});

describe("planRestore", () => {
  const movie = {
    localId: "7a8f5c20-564a-4bb1-928b-e54506617339",
    slug: "manual-film-2026", title: "Manual Film", year: 2026, countries: [],
  };
  const local = { localId: movie.localId, movie, watched: false, want: false };

  it("plans recreating even an unmarked film, and describes its stable link", () => {
    const plan = planRestore([local], [], []);
    expect(plan.problems).toEqual([]);
    expect(plan.creates).toEqual([{ movie, to: { watched: false, want: false, ...EMPTY, updatedAt: undefined } }]);
    expect(formatPlan(plan, "Plan")).toContain("0 marks to write, 1 films to recreate");
    expect(formatPlan(plan, "Plan")).toContain("/movies/manual-film-2026: none");
    expect(formatPlan(planRestore([{ ...local, want: true }], [], []), "Plan"))
      .toContain("1 marks to write, 1 films to recreate");
  });

  it("finds existing TMDB-only and local-only films", () => {
    const film = { ...anora, tmdbId: 123, localId: movie.localId };
    for (const identity of [{ tmdb: 123 }, { localId: movie.localId }]) {
      const plan = planRestore([{ ...identity, watched: true, want: false }], [film], []);
      expect(plan.problems).toEqual([]);
      expect(plan.writes[0].film).toEqual(film);
      expect(plan.creates).toEqual([]);
    }
  });

  it("refuses identities pointing to different films or disagreeing with a known ID", () => {
    for (const identity of [
      { imdb: "tt1", wd: "Q2" }, { imdb: "tt999", wd: "Q1" }, { imdb: "tt1", tmdb: 123 },
    ]) {
      const plan = planRestore([{ ...identity, watched: true, want: false }], [anora, { ...conclave, tmdbId: 123 }], []);
      expect(plan.problems).toEqual([expect.stringMatching(/conflicting film identities/)]);
      expect(plan.writes).toEqual([]);
    }
  });

  it("refuses slug collisions, changed local slugs and local identity replacement", () => {
    for (const existing of [
      { ...anora, slug: movie.slug },
      { ...anora, localId: movie.localId },
    ]) {
      const entry = { ...local, ...(existing.tmdbId ? { tmdb: 123, movie: { ...movie, tmdb: 123 } } : {}) };
      expect(planRestore([entry], [existing], []).problems).toEqual([expect.stringMatching(/conflicting stable slug or local identity/)]);
    }
  });

  it("puts the marks on a researched film that now carries the app film's TMDB ID, after a rebuild (9.R)", () => {
    // Rebuild order (runbook): research load first, then restore. The film entered research meanwhile,
    // so its row has the research slug and no local ID; every external ID agrees, so it is the same film.
    const researched: Film = { ...anora, slug: "anora-research", tmdbId: 123 };
    const entry = { ...local, tmdb: 123, movie: { ...movie, tmdb: 123 }, want: true };
    const plan = planRestore([entry], [researched], []);
    expect(plan.problems).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.writes).toEqual([expect.objectContaining({ kind: "insert", film: researched })]);
  });

  it("refuses two snapshots claiming the same stable slug", () => {
    const other = { ...movie, localId: "c7590917-f1ad-49ad-a224-7be63dff128d" };
    expect(planRestore([local, { ...local, localId: other.localId, movie: other }], [], []).problems)
      .toEqual([expect.stringMatching(/conflicting stable slug/)]);
  });

  it("plans nothing when the file matches the database", () => {
    const plan = planRestore(
      [
        { imdb: "tt1", watched: true, want: false },
        { wd: "Q3", watched: false, want: true },
      ],
      films,
      [
        row(1, true, false),
        row(3, false, true),
      ],
    );
    expect(plan).toEqual({ entries: [
      { imdb: "tt1", watched: true, want: false }, { wd: "Q3", watched: false, want: true },
    ], creates: [], writes: [], unchanged: 2, problems: [], notInFile: [] });
  });

  it("inserts a film with no row and updates one whose marks differ", () => {
    const plan = planRestore(
      [
        { imdb: "tt1", watched: true, want: false, updatedAt: "2026-01-02T03:04:05.000Z" },
        { imdb: "tt2", watched: true, want: false },
      ],
      films,
      [row(2, false, true)],
    );
    expect(plan.writes).toEqual([
      {
        kind: "insert",
        film: anora,
        from: null,
        to: { watched: true, want: false, ...EMPTY, updatedAt: "2026-01-02T03:04:05.000Z" },
      },
      {
        kind: "update",
        film: conclave,
        from: { watched: false, want: true, ...EMPTY },
        to: { watched: true, want: false, ...EMPTY, updatedAt: undefined },
      },
    ]);
  });

  it("treats a film with no row as neither watched nor want", () => {
    const plan = planRestore([{ imdb: "tt1", watched: false, want: false }], films, []);
    expect(plan.writes).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("finds a film by QID when its IMDb ID isn't in the database", () => {
    const plan = planRestore([{ imdb: "tt999", wd: "Q3", watched: true, want: false }], films, []);
    expect(plan.writes[0]?.film).toBe(noImdb);
  });

  it("lists an unknown film and two entries for one film as problems", () => {
    const plan = planRestore(
      [
        { imdb: "tt404", title: "Gone", watched: true, want: false },
        { imdb: "tt1", watched: true, want: false },
        { wd: "Q1", watched: false, want: true },
      ],
      films,
      [],
    );
    expect(plan.problems).toEqual([
      "Gone (tt404): no such film in the database.",
      "Q1 and tt1 are the same film, Anora (2024, tt1).",
    ]);
  });

  it("keeps marks the file doesn't mention, and lists them", () => {
    const plan = planRestore([], films, [
      row(2, true, false),
      row(1, false, false),
    ]);
    expect(plan.writes).toEqual([]);
    expect(plan.notInFile).toEqual([{ film: conclave, mark: { watched: true, want: false, ...EMPTY } }]);
  });

  it("keeps release notes the file doesn't mention, and lists them", () => {
    const notes = { releaseOn: "2026-12-12", platform: "Netflix" };
    const plan = planRestore([], films, [row(2, false, false, notes)]);
    expect(plan.notInFile).toEqual([{ film: conclave, mark: { watched: false, want: false, wantRank: null, ...notes } }]);
  });

  it("restores the Watch list fields a newer file carries, nulls included", () => {
    const plan = planRestore(
      [
        { imdb: "tt1", watched: false, want: true, wantRank: 2, releaseOn: "2026-12-12", platform: "Netflix" },
        { imdb: "tt2", watched: false, want: true, wantRank: 1, releaseOn: null, platform: null },
      ],
      films,
      [row(1, false, true, { wantRank: 1 }), row(2, false, true, { wantRank: 2, releaseOn: "2026-11-01", platform: "MUBI" })],
    );
    expect(plan.writes.map((w) => [w.film.id, w.to])).toEqual([
      [1, { watched: false, want: true, wantRank: 2, releaseOn: "2026-12-12", platform: "Netflix", updatedAt: undefined }],
      [2, { watched: false, want: true, wantRank: 1, releaseOn: null, platform: null, updatedAt: undefined }],
    ]);
  });

  it("leaves the Watch list fields alone for an older file without them", () => {
    const notes = { releaseOn: "2026-12-12", platform: "Netflix" };
    const plan = planRestore(
      [
        { imdb: "tt1", watched: false, want: true },
        { imdb: "tt2", watched: true, want: false },
        { wd: "Q3", watched: false, want: true },
      ],
      films,
      [row(1, false, true, { wantRank: 3, ...notes }), row(2, false, true, { wantRank: 1, ...notes }), row(3, false, false, notes)],
    );
    // Anora: unchanged. Conclave: watched now, so it loses its rank but keeps its notes.
    // Flow: wanted again, unranked (it sorts last), notes kept.
    expect(plan.unchanged).toBe(1);
    expect(plan.writes.map((w) => [w.film.id, w.to])).toEqual([
      [2, { watched: true, want: false, wantRank: null, ...notes, updatedAt: undefined }],
      [3, { watched: false, want: true, wantRank: null, ...notes, updatedAt: undefined }],
    ]);
  });
});

describe("formatPlan", () => {
  it("prints every planned write, the kept marks and the problems", () => {
    const plan = planRestore(
      [
        { imdb: "tt1", watched: true, want: false },
        { imdb: "tt2", watched: true, want: false },
        { imdb: "tt404", watched: true, want: false },
      ],
      films,
      [
        row(2, false, true),
        row(3, false, true),
      ],
    );
    expect(formatPlan(plan, "Plan")).toBe(
      [
        "Plan: 2 marks to write, 0 films to recreate, 0 unchanged.",
        "  insert  Anora (2024, tt1): watched",
        "  update  Conclave (2024, tt2): want → watched",
        "Marked in the database but not in the file (left as they are): 1",
        "  keep    Flow (2024, Q3): want",
        "Can't restore 1 entry:",
        "  tt404: no such film in the database.",
      ].join("\n"),
    );
  });
});

describe("serializeMarks", () => {
  it("writes one film per line", () => {
    expect(serializeMarks([])).toBe("[]\n");
    expect(
      serializeMarks([
        { imdb: "tt1", watched: true, want: false },
        { wd: "Q3", watched: false, want: true },
      ]),
    ).toBe('[\n  {"imdb":"tt1","watched":true,"want":false},\n  {"wd":"Q3","watched":false,"want":true}\n]\n');
  });
});

describe("exportProblem", () => {
  const base = { target: "production" as const, file: "data/marks.json", allowShrink: false };

  it("lets an export write a new file, the same count or more", () => {
    expect(exportProblem({ ...base, previous: null, next: 0 })).toBeNull();
    expect(exportProblem({ ...base, previous: 4, next: 4 })).toBeNull();
    expect(exportProblem({ ...base, previous: 4, next: 9 })).toBeNull();
  });

  it("keeps a file that would shrink unless --allow-shrink is passed", () => {
    expect(exportProblem({ ...base, previous: 12, next: 0 })).toMatch(/has 12 backed-up films and production has only 0/);
    expect(exportProblem({ ...base, previous: 12, next: 3, allowShrink: true })).toBeNull();
  });

  it("never lets a test export write the production backup", () => {
    for (const file of ["data/marks.json", "./data/marks.json", "data//marks.json"]) {
      expect(exportProblem({ ...base, target: "test", file, previous: null, next: 1 })).toMatch(/production backup/);
    }
    expect(exportProblem({ ...base, target: "test", file: ".cache/marks.test.json", previous: null, next: 1 })).toBeNull();
  });
});
