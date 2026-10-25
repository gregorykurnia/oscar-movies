-- Watch list order and release notes (task 7.4, IMPLEMENTATION_PLAN.md §3.1). Adds columns
-- only: no mark changes, except that films already wanted get an order, most recently marked
-- first (a newly wanted film goes to the top from now on).
ALTER TABLE "marks" ADD COLUMN "want_rank" integer;--> statement-breakpoint
ALTER TABLE "marks" ADD COLUMN "release_on" date;--> statement-breakpoint
ALTER TABLE "marks" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_want_rank" CHECK ("marks"."want_rank" is null or ("marks"."want" and "marks"."want_rank" > 0));--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_platform" CHECK ("marks"."platform" is null or char_length("marks"."platform") between 1 and 40);--> statement-breakpoint
UPDATE "marks" SET "want_rank" = "ranked"."rank" FROM (SELECT "movie_id", row_number() OVER (ORDER BY "updated_at" DESC, "movie_id") AS "rank" FROM "marks" WHERE "want") AS "ranked" WHERE "marks"."movie_id" = "ranked"."movie_id";
