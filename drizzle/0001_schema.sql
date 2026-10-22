CREATE TYPE "public"."award_kind" AS ENUM('oscars', 'major', 'festival', 'critics');--> statement-breakpoint
CREATE TYPE "public"."edition_status" AS ENUM('loaded', 'partial', 'no_data');--> statement-breakpoint
CREATE TYPE "public"."oscar_category" AS ENUM('picture', 'documentary', 'international', 'animated');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('submitted', 'eligible', 'shortlisted', 'runner_up', 'nominated', 'won');--> statement-breakpoint
CREATE TYPE "public"."snapshot" AS ENUM('live', 'eve_nominations', 'eve_ceremony');--> statement-breakpoint
CREATE TABLE "accuracy" (
	"category_id" integer PRIMARY KEY NOT NULL,
	"win_hits" smallint NOT NULL,
	"win_count" smallint NOT NULL,
	"nom_hits" smallint NOT NULL,
	"nom_count" smallint NOT NULL,
	"nominees_hits" smallint,
	"nominees_count" smallint,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "award_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"award_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"oscar_category" "oscar_category" NOT NULL,
	"loose" boolean DEFAULT false NOT NULL,
	"mapping_note" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "award_categories_award_slug_key" UNIQUE("award_id","slug")
);
--> statement-breakpoint
CREATE TABLE "awards" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"kind" "award_kind" NOT NULL,
	"calendar_order" smallint NOT NULL,
	"winners_only" boolean DEFAULT false NOT NULL,
	"is_selection" boolean DEFAULT false NOT NULL,
	"url" text,
	CONSTRAINT "awards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "data_loads" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"summary" jsonb NOT NULL,
	"git_commit" text,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_loads_kind" CHECK ("data_loads"."kind" in ('awards', 'race-update', 'correction', 'scores'))
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" serial PRIMARY KEY NOT NULL,
	"award_id" integer NOT NULL,
	"year" smallint NOT NULL,
	"ordinal" text,
	"status" "edition_status" NOT NULL,
	"shortlist_on" date,
	"nominations_on" date,
	"winners_on" date,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text,
	CONSTRAINT "editions_award_year_key" UNIQUE("award_id","year")
);
--> statement-breakpoint
CREATE TABLE "marks" (
	"movie_id" integer PRIMARY KEY NOT NULL,
	"watched" boolean DEFAULT false NOT NULL,
	"want" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marks_not_watched_and_want" CHECK (not ("marks"."watched" and "marks"."want"))
);
--> statement-breakpoint
CREATE TABLE "movies" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"original_lang" text,
	"year" smallint NOT NULL,
	"countries" text[] NOT NULL,
	"language" text,
	"imdb_id" text,
	"wikidata_id" text,
	"tmdb_id" integer,
	"imdb_rating" numeric(3, 1),
	"rt_score" smallint,
	"mc_score" smallint,
	"tmdb_score" numeric(3, 1),
	"imdb_at" timestamp with time zone,
	"rt_at" timestamp with time zone,
	"mc_at" timestamp with time zone,
	"tmdb_at" timestamp with time zone,
	"scores_checked_at" timestamp with time zone,
	"avg_score" numeric(4, 1) GENERATED ALWAYS AS (round(
        (coalesce(imdb_rating * 10, 0) + coalesce(tmdb_score * 10, 0)
          + coalesce(rt_score, 0) + coalesce(mc_score, 0))
        / nullif((
  (imdb_rating is not null)::int + (tmdb_score is not null)::int
  + (rt_score is not null)::int + (mc_score is not null)::int
), 0),
        1
      )) STORED,
	"score_count" smallint GENERATED ALWAYS AS ((
  (imdb_rating is not null)::int + (tmdb_score is not null)::int
  + (rt_score is not null)::int + (mc_score is not null)::int
)::smallint) STORED NOT NULL,
	"search_key" text GENERATED ALWAYS AS (f_unaccent(lower(title || ' ' || coalesce(original_title, '')))) STORED NOT NULL,
	CONSTRAINT "movies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "movies_imdb_id_unique" UNIQUE("imdb_id"),
	CONSTRAINT "movies_wikidata_id_unique" UNIQUE("wikidata_id"),
	CONSTRAINT "movies_tmdb_id_unique" UNIQUE("tmdb_id"),
	CONSTRAINT "movies_has_id" CHECK ("movies"."imdb_id" is not null or "movies"."wikidata_id" is not null),
	CONSTRAINT "movies_imdb_id_format" CHECK ("movies"."imdb_id" ~ '^tt[0-9]+$'),
	CONSTRAINT "movies_wikidata_id_format" CHECK ("movies"."wikidata_id" ~ '^Q[0-9]+$'),
	CONSTRAINT "movies_imdb_rating_range" CHECK ("movies"."imdb_rating" between 0 and 10),
	CONSTRAINT "movies_rt_score_range" CHECK ("movies"."rt_score" between 0 and 100),
	CONSTRAINT "movies_mc_score_range" CHECK ("movies"."mc_score" between 0 and 100),
	CONSTRAINT "movies_tmdb_score_range" CHECK ("movies"."tmdb_score" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"year" smallint NOT NULL,
	"oscar_category" "oscar_category" NOT NULL,
	"snapshot" "snapshot" NOT NULL,
	"movie_id" integer NOT NULL,
	"p_nominate" real,
	"p_win" real NOT NULL,
	"rank" smallint NOT NULL,
	"why" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "predictions_pkey" PRIMARY KEY("year","oscar_category","snapshot","movie_id")
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"movie_id" integer NOT NULL,
	"outcome" "outcome" NOT NULL,
	"country" text,
	CONSTRAINT "results_edition_category_movie_key" UNIQUE("edition_id","category_id","movie_id")
);
--> statement-breakpoint
CREATE TABLE "screenings" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"movie_id" integer NOT NULL,
	"section" text NOT NULL,
	"section_order" smallint DEFAULT 0 NOT NULL,
	"prize" text,
	CONSTRAINT "screenings_edition_movie_section_key" UNIQUE("edition_id","movie_id","section")
);
--> statement-breakpoint
ALTER TABLE "accuracy" ADD CONSTRAINT "accuracy_category_id_award_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."award_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_categories" ADD CONSTRAINT "award_categories_award_id_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."awards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_award_id_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."awards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_category_id_award_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."award_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_loads_kind_loaded_at_idx" ON "data_loads" USING btree ("kind","loaded_at");--> statement-breakpoint
CREATE INDEX "movies_year_idx" ON "movies" USING btree ("year");--> statement-breakpoint
CREATE INDEX "movies_avg_score_idx" ON "movies" USING btree ("avg_score");--> statement-breakpoint
CREATE INDEX "movies_search_key_trgm_idx" ON "movies" USING gin ("search_key" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "predictions_movie_id_idx" ON "predictions" USING btree ("movie_id");--> statement-breakpoint
CREATE INDEX "results_movie_id_idx" ON "results" USING btree ("movie_id");--> statement-breakpoint
CREATE INDEX "results_category_id_idx" ON "results" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "screenings_movie_id_idx" ON "screenings" USING btree ("movie_id");