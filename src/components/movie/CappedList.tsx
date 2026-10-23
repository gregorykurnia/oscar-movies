"use client";

import { useState, type ReactNode } from "react";
import { ShowAllButton } from "@/components/show-all/ShowAllRow";

/**
 * The critics groups' capped list (guide §8.6): the first rows, then the guide §7 Show all row, which
 * opens the rest in the same list and closes it again. The row's top rule is the list's only closing
 * rule, open or not (triage 2-9). Focus stays on the button.
 */
export function CappedList({ head, rest, label }: { head: ReactNode; rest: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ul>
        {head}
        {open ? rest : null}
      </ul>
      <ShowAllButton aria-expanded={open} onClick={() => setOpen(!open)} label={open ? "Show fewer" : label} />
    </>
  );
}
