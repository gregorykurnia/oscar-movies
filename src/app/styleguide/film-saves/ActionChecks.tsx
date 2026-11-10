"use client";

import { useEffect } from "react";
import { addFilm } from "@/app/actions/add-film";
import { saveMark } from "@/app/actions/marks";
import { addToWatchList, reorderWatchList, setRelease } from "@/app/actions/watch-list";

// Test-only action references, so the real Server Actions can be checked before the new UI
// is wired. The parent page refuses this component unless the connected database is test.
const checks = { addFilm, saveMark, addToWatchList, reorderWatchList, setRelease };
declare global {
  interface Window { filmSaveChecks?: typeof checks }
}
export function ActionChecks() {
  useEffect(() => {
    window.filmSaveChecks = checks;
    return () => { delete window.filmSaveChecks; };
  }, []);
  return null;
}
