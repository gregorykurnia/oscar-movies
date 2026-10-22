// The restore planner's rules (IMPLEMENTATION_PLAN.md §3.5): no database, made-up films.
import { describe, expect, it } from "vitest";
import { exportProblem, formatPlan, planRestore, serializeMarks, type Film } from "./marks";

const anora: Film = { id: 1, imdbId: "tt1", wikidataId: "Q1", title: "Anora", year: 2024 };
const conclave: Film = { id: 2, imdbId: "tt2", wikidataId: "Q2", title: "Conclave", year: 2024 };
const noImdb: Film = { id: 3, imdbId: null, wikidataId: "Q3", title: "Flow", year: 2024 };
const films = [anora, conclave, noImdb];

describe("planRestore", () => {
  it("plans nothing when the file matches the database", () => {
    const plan = planRestore(
      [
        { imdb: "tt1", watched: true, want: false },
        { wd: "Q3", watched: false, want: true },
      ],
      films,
      [
        { movieId: 1, watched: true, want: false },
        { movieId: 3, watched: false, want: true },
      ],
    );
    expect(plan).toEqual({ writes: [], unchanged: 2, problems: [], notInFile: [] });
  });

  it("inserts a film with no row and updates one whose marks differ", () => {
    const plan = planRestore(
      [
        { imdb: "tt1", watched: true, want: false, updatedAt: "2026-01-02T03:04:05.000Z" },
        { imdb: "tt2", watched: true, want: false },
      ],
      films,
      [{ movieId: 2, watched: false, want: true }],
    );
    expect(plan.writes).toEqual([
      {
        kind: "insert",
        film: anora,
        from: null,
        to: { watched: true, want: false, updatedAt: "2026-01-02T03:04:05.000Z" },
      },
      { kind: "update", film: conclave, from: { watched: false, want: true }, to: { watched: true, want: false } },
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
      { movieId: 2, watched: true, want: false },
      { movieId: 1, watched: false, want: false },
    ]);
    expect(plan.writes).toEqual([]);
    expect(plan.notInFile).toEqual([{ film: conclave, mark: { watched: true, want: false } }]);
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
        { movieId: 2, watched: false, want: true },
        { movieId: 3, watched: false, want: true },
      ],
    );
    expect(formatPlan(plan, "Plan")).toBe(
      [
        "Plan: 2 to write, 0 unchanged.",
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
    expect(exportProblem({ ...base, previous: 12, next: 0 })).toMatch(/has 12 marked films and production has only 0/);
    expect(exportProblem({ ...base, previous: 12, next: 3, allowShrink: true })).toBeNull();
  });

  it("never lets a test export write the production backup", () => {
    for (const file of ["data/marks.json", "./data/marks.json", "data//marks.json"]) {
      expect(exportProblem({ ...base, target: "test", file, previous: null, next: 1 })).toMatch(/production backup/);
    }
    expect(exportProblem({ ...base, target: "test", file: ".cache/marks.test.json", previous: null, next: 1 })).toBeNull();
  });
});
