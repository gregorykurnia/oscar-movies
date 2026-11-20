-- Letterboxd rating (owner, 2026-11-20, PRODUCT_PLAN.md §3.2): two nullable columns and a range check;
-- no existing row changes, and the generated average doesn't use them.
ALTER TABLE "movies" ADD COLUMN "lb_rating" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "lb_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_lb_rating_range" CHECK ("movies"."lb_rating" between 0 and 5);