// Class strings shared by the live search and the styleguide's drawn copies. They live here, not
// in `SearchCommand.tsx` ("use client"): a server page that imports a constant from a client file
// gets a client reference, not the string.

/** The open search box: a gold border and halo. */
export const searchFocusedBox =
  "flex items-center gap-2 rounded-[9px] border border-gold-ink bg-surface pr-2.5 pl-3 text-ink shadow-[0_0_0_3px_var(--gold-wash)]";

/** A key cap ("/", "esc"). */
export const searchKbd = "rounded-[5px] border border-line bg-surface px-1.5 text-micro leading-[18px] text-ink-muted";
