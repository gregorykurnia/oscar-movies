// `npx tsx scripts/remove-award.ts --target test|production [--yes-production] [--dry-run] --award <slug>`
//
// Removes an award the app no longer follows from the database: its editions with their results
// and screenings, its categories with their accuracy rows, and the award itself, then recomputes
// the computed tables, in one transaction. The loader never deletes an award, so this is the one
// way to drop one. The award must already be gone from `data/awards.json` and `data/editions/`
// (the files are the source). Movies stay: a film only that award named is harmless. On
// `production` it exports the marks first, as every correction does (docs/runbook.md).
import { existsSync } from "node:fs";
import { count, eq, inArray } from "drizzle-orm";
import { createScriptDb } from "../src/db";
import { readDbBranch } from "../src/db/meta";
import { awardCategories, awards, dataLoads, editions, results } from "../src/db/schema";
import { recomputeAccuracy, recomputePredictions } from "./lib/compute";
import { gitCommit, revalidateAwards } from "./lib/load";
import { readDataSet } from "./lib/data-check";
import { exportMarksToFile, PRODUCTION_MARKS_FILE } from "./lib/marks";
import { loadTargetEnv, parseTargetArgs } from "./lib/target";

async function main() {
  const argv = process.argv.slice(2);
  const { target } = parseTargetArgs(argv, { flags: ["--dry-run"], values: ["--award"] });
  const slug = argv[argv.indexOf("--award") + 1];
  if (!argv.includes("--award") || !slug) throw new Error("Pass --award <slug>.");
  const dryRun = argv.includes("--dry-run");

  const { data } = readDataSet("data");
  if (data.awards.some((a) => a.slug === slug) || existsSync(`data/editions/${slug}`)) {
    throw new Error(`${slug} is still in data/awards.json or data/editions/. Remove it from the files first. Nothing was written.`);
  }

  loadTargetEnv(target);
  const { db, close } = createScriptDb();
  try {
    const branch = await readDbBranch(db);
    if (branch !== target) {
      throw new Error(`app_meta.db_branch is ${JSON.stringify(branch)}, not "${target}". Nothing was written.`);
    }
    const [award] = await db.select().from(awards).where(eq(awards.slug, slug));
    if (!award) {
      console.log(`${slug} isn't in the ${target} database. Nothing to do.`);
      return;
    }
    const editionIds = (await db.select({ id: editions.id }).from(editions).where(eq(editions.awardId, award.id))).map((e) => e.id);
    const [{ n: resultCount }] =
      editionIds.length > 0
        ? await db.select({ n: count() }).from(results).where(inArray(results.editionId, editionIds))
        : [{ n: 0 }];
    const categoryCount = (await db.select({ id: awardCategories.id }).from(awardCategories).where(eq(awardCategories.awardId, award.id))).length;
    console.log(`${target}: remove ${award.name} (${slug}): ${editionIds.length} editions, ${resultCount} results, ${categoryCount} categories.`);
    if (dryRun) {
      console.log("Dry run: nothing was written.");
      return;
    }

    if (target === "production") {
      try {
        console.log(await exportMarksToFile(db, { target: "production", file: PRODUCTION_MARKS_FILE, allowShrink: false }));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`The marks export failed, so nothing was removed.\n${reason}`);
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const lines = await db.transaction(async (tx) => {
      // Editions cascade to results and screenings, categories to accuracy.
      await tx.delete(editions).where(eq(editions.awardId, award.id));
      await tx.delete(awardCategories).where(eq(awardCategories.awardId, award.id));
      await tx.delete(awards).where(eq(awards.id, award.id));
      const computed = [await recomputeAccuracy(tx, today), await recomputePredictions(tx, today)];
      await tx.insert(dataLoads).values({
        kind: "correction",
        summary: { target, removedAward: slug, editions: editionIds.length, results: resultCount, categories: categoryCount },
        gitCommit: gitCommit(),
      });
      return computed;
    });
    console.log(lines.join("\n"));
    console.log(`Removed ${slug}.`);
    console.log(await revalidateAwards());
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
