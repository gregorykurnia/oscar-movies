"use client";

import { useRouter } from "next/navigation";
import { Chip } from "./Chip";

export type FilterLink = {
  label: string;
  /** The address with this chip flipped (the server builds it, so the client never parses the filters). */
  href: string;
  pressed: boolean;
};

/**
 * Guide §7 Filter chips, as a group. A press moves the address to the chip's `href` (replaced, not
 * pushed, scroll kept), and the page reads its list from the new address, so the view is always
 * the one in the address.
 */
export function FilterChips({ label, items }: { label: string; items: FilterLink[] }) {
  const router = useRouter();
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Chip key={item.label} pressed={item.pressed} onClick={() => router.replace(item.href, { scroll: false })}>
          {item.label}
        </Chip>
      ))}
    </div>
  );
}
