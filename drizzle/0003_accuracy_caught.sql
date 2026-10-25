-- Fourth accuracy figure, "Oscar nominees it caught" (PRODUCT_PLAN.md §3.6). Null until the
-- next `npm run compute` (or load), and for winners-only awards.
ALTER TABLE "accuracy" ADD COLUMN "caught_hits" smallint;--> statement-breakpoint
ALTER TABLE "accuracy" ADD COLUMN "caught_count" smallint;