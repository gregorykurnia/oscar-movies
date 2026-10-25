// The database schema (IMPLEMENTATION_PLAN.md §3.1). Migrations in `drizzle/` are generated
// from this file with `npm run db:generate`; `drizzle/0000_extensions.sql` is hand-written
// and creates `unaccent`, `pg_trgm` and `f_unaccent`, which `movies.search_key` needs.
//
// Delete rules guard the marks, the only data that exists nowhere else: nothing that a mark
// points at can be deleted (`movies` → `marks` is restrict), and imports only replace the
// results and screenings of an edition (cascade from `editions`).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const awardKind = pgEnum("award_kind", ["oscars", "major", "festival", "critics"]);
export const oscarCategory = pgEnum("oscar_category", [
  "picture",
  "documentary",
  "international",
  "animated",
]);
export const outcome = pgEnum("outcome", [
  "submitted",
  "eligible",
  "shortlisted",
  "runner_up",
  "nominated",
  "won",
]);
export const editionStatus = pgEnum("edition_status", ["loaded", "partial", "no_data"]);
export const snapshot = pgEnum("snapshot", ["live", "eve_nominations", "eve_ceremony"]);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// §3.2 rule 1: IMDb and TMDB on a 0–100 scale (× 10), Tomatometer and Metacritic as they are.
// Generated columns can't read each other, so the count is spelled out twice.
const scoreCountSql = sql`(
  (imdb_rating is not null)::int + (tmdb_score is not null)::int
  + (rt_score is not null)::int + (mc_score is not null)::int
)`;

export const movies = pgTable(
  "movies",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    // BCP 47 tag of the original title, for `lang=`.
    originalLang: text("original_lang"),
    year: smallint("year").notNull(),
    // ISO 3166-1 alpha-2, main country first.
    countries: text("countries").array().notNull(),
    language: text("language"),
    imdbId: text("imdb_id").unique(),
    wikidataId: text("wikidata_id").unique(),
    tmdbId: integer("tmdb_id").unique(),
    imdbRating: numeric("imdb_rating", { precision: 3, scale: 1, mode: "number" }),
    rtScore: smallint("rt_score"),
    mcScore: smallint("mc_score"),
    tmdbScore: numeric("tmdb_score", { precision: 3, scale: 1, mode: "number" }),
    imdbAt: timestamptz("imdb_at"),
    rtAt: timestamptz("rt_at"),
    mcAt: timestamptz("mc_at"),
    tmdbAt: timestamptz("tmdb_at"),
    scoresCheckedAt: timestamptz("scores_checked_at"),
    avgScore: numeric("avg_score", { precision: 4, scale: 1, mode: "number" }).generatedAlwaysAs(
      sql`round(
        (coalesce(imdb_rating * 10, 0) + coalesce(tmdb_score * 10, 0)
          + coalesce(rt_score, 0) + coalesce(mc_score, 0))
        / nullif(${scoreCountSql}, 0),
        1
      )`,
    ),
    scoreCount: smallint("score_count")
      .notNull()
      .generatedAlwaysAs(sql`${scoreCountSql}::smallint`),
    searchKey: text("search_key")
      .notNull()
      .generatedAlwaysAs(sql`f_unaccent(lower(title || ' ' || coalesce(original_title, '')))`),
  },
  (t) => [
    index("movies_year_idx").on(t.year),
    index("movies_avg_score_idx").on(t.avgScore),
    index("movies_search_key_trgm_idx").using("gin", sql`${t.searchKey} gin_trgm_ops`),
    check("movies_has_id", sql`${t.imdbId} is not null or ${t.wikidataId} is not null`),
    check("movies_imdb_id_format", sql`${t.imdbId} ~ '^tt[0-9]+$'`),
    check("movies_wikidata_id_format", sql`${t.wikidataId} ~ '^Q[0-9]+$'`),
    check("movies_imdb_rating_range", sql`${t.imdbRating} between 0 and 10`),
    check("movies_rt_score_range", sql`${t.rtScore} between 0 and 100`),
    check("movies_mc_score_range", sql`${t.mcScore} between 0 and 100`),
    check("movies_tmdb_score_range", sql`${t.tmdbScore} between 0 and 10`),
  ],
);

// The owner's watched and want-to-watch marks, and from 7.4 their Want to watch order and
// release notes: written only by the marks and Watch list actions and the marks restore
// script, never by imports. `want_rank` orders the wanted films (1 = top; ties by title) and
// is null when the film isn't wanted; `release_on` (null = TBD) and `platform` stay when it
// stops being wanted.
export const marks = pgTable(
  "marks",
  {
    movieId: integer("movie_id")
      .primaryKey()
      .references(() => movies.id, { onDelete: "restrict" }),
    watched: boolean("watched").notNull().default(false),
    want: boolean("want").notNull().default(false),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    wantRank: integer("want_rank"),
    releaseOn: date("release_on"),
    platform: text("platform"),
  },
  (t) => [
    check("marks_not_watched_and_want", sql`not (${t.watched} and ${t.want})`),
    check("marks_want_rank", sql`${t.wantRank} is null or (${t.want} and ${t.wantRank} > 0)`),
    check("marks_platform", sql`${t.platform} is null or char_length(${t.platform}) between 1 and 40`),
  ],
);

export const awards = pgTable("awards", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  kind: awardKind("kind").notNull(),
  calendarOrder: smallint("calendar_order").notNull(),
  // Announces winners only (no nominees).
  winnersOnly: boolean("winners_only").notNull().default(false),
  // A list with no winner (AFI).
  isSelection: boolean("is_selection").notNull().default(false),
  url: text("url"),
});

export const awardCategories = pgTable(
  "award_categories",
  {
    id: serial("id").primaryKey(),
    awardId: integer("award_id")
      .notNull()
      .references(() => awards.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    // The award's own name for the category.
    name: text("name").notNull(),
    oscarCategory: oscarCategory("oscar_category").notNull(),
    // Director or cast prizes mapped to a film category.
    loose: boolean("loose").notNull().default(false),
    mappingNote: text("mapping_note"),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (t) => [unique("award_categories_award_slug_key").on(t.awardId, t.slug)],
);

// One award in one film year.
export const editions = pgTable(
  "editions",
  {
    id: serial("id").primaryKey(),
    awardId: integer("award_id")
      .notNull()
      .references(() => awards.id, { onDelete: "restrict" }),
    // The film year it honours (2012 on).
    year: smallint("year").notNull(),
    // "98th"
    ordinal: text("ordinal"),
    status: editionStatus("status").notNull(),
    shortlistOn: date("shortlist_on"),
    nominationsOn: date("nominations_on"),
    winnersOn: date("winners_on"),
    sourceUrls: text("source_urls").array().notNull().default(sql`'{}'::text[]`),
    note: text("note"),
  },
  (t) => [unique("editions_award_year_key").on(t.awardId, t.year)],
);

// One row per film per category: its furthest stage.
export const results = pgTable(
  "results",
  {
    id: serial("id").primaryKey(),
    editionId: integer("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => awardCategories.id, { onDelete: "restrict" }),
    movieId: integer("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "restrict" }),
    outcome: outcome("outcome").notNull(),
    // Submitting country (International only), ISO 3166-1 alpha-2.
    country: text("country"),
  },
  (t) => [
    unique("results_edition_category_movie_key").on(t.editionId, t.categoryId, t.movieId),
    index("results_movie_id_idx").on(t.movieId),
    index("results_category_id_idx").on(t.categoryId),
  ],
);

// Festival lineups, 2025 on.
export const screenings = pgTable(
  "screenings",
  {
    id: serial("id").primaryKey(),
    editionId: integer("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    movieId: integer("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "restrict" }),
    section: text("section").notNull(),
    sectionOrder: smallint("section_order").notNull().default(0),
    prize: text("prize"),
  },
  (t) => [
    unique("screenings_edition_movie_section_key").on(t.editionId, t.movieId, t.section),
    index("screenings_movie_id_idx").on(t.movieId),
  ],
);

// Computed by the loader (§5.2), never typed. Each figure is hits over a count; the
// nominees and caught figures are null for `winners_only` awards.
export const accuracy = pgTable("accuracy", {
  categoryId: integer("category_id")
    .primaryKey()
    .references(() => awardCategories.id, { onDelete: "cascade" }),
  winHits: smallint("win_hits").notNull(),
  winCount: smallint("win_count").notNull(),
  nomHits: smallint("nom_hits").notNull(),
  nomCount: smallint("nom_count").notNull(),
  nomineesHits: smallint("nominees_hits"),
  nomineesCount: smallint("nominees_count"),
  caughtHits: smallint("caught_hits"),
  caughtCount: smallint("caught_count"),
  computedAt: timestamptz("computed_at").notNull().defaultNow(),
});

// Computed by `scripts/compute.ts` (§5.3); pages never compute.
export const predictions = pgTable(
  "predictions",
  {
    year: smallint("year").notNull(),
    oscarCategory: oscarCategory("oscar_category").notNull(),
    snapshot: snapshot("snapshot").notNull(),
    movieId: integer("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    // Shown until the nominations; null after.
    pNominate: real("p_nominate"),
    pWin: real("p_win").notNull(),
    rank: smallint("rank").notNull(),
    why: jsonb("why").notNull(),
    computedAt: timestamptz("computed_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "predictions_pkey",
      columns: [t.year, t.oscarCategory, t.snapshot, t.movieId],
    }),
    index("predictions_movie_id_idx").on(t.movieId),
  ],
);

export const dataLoads = pgTable(
  "data_loads",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    summary: jsonb("summary").notNull(),
    gitCommit: text("git_commit"),
    loadedAt: timestamptz("loaded_at").notNull().defaultNow(),
  },
  (t) => [
    check("data_loads_kind", sql`${t.kind} in ('awards', 'race-update', 'correction', 'scores')`),
    index("data_loads_kind_loaded_at_idx").on(t.kind, t.loadedAt),
  ],
);

// `db_branch` = `test` or `production`, written once per Neon branch (§2).
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
