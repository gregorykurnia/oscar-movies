"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/button/Button";
import { OPEN_SEARCH_EVENT } from "./open-search";

/** A secondary "Search" button for pages (the 404): it opens the top bar's search. */
export function OpenSearchButton() {
  return (
    <Button variant="secondary" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}>
      <Search aria-hidden="true" strokeWidth={1.75} />
      Search
    </Button>
  );
}
