"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { writeMark } from "@/data/marks";

// The marks Server Action (plan §5.6). Anyone with the address can call it (no sign-in, the
// owner's choice), so it checks everything: a whole number id of a film that exists, and a
// state that isn't watched and wanted at once. It sends the whole state, not one field, so
// whichever request lands last is exactly the state the page shows.
const input = z
  .object({ movieId: z.number().int().positive(), watched: z.boolean(), want: z.boolean() })
  .strict()
  .refine((v) => !(v.watched && v.want), "A film can't be both watched and wanted");

export type SaveMarkInput = z.input<typeof input>;
export type SaveMarkResult = { ok: boolean };

export async function saveMark(raw: SaveMarkInput): Promise<SaveMarkResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const { movieId, watched, want } = parsed.data;
  try {
    return { ok: await writeMark(getDb(), movieId, { watched, want }) };
  } catch (error) {
    console.error("saveMark failed", { movieId }, error);
    return { ok: false };
  }
}
