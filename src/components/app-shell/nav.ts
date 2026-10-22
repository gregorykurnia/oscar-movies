// The main nav, in the guide's order (§6.1). Year summary is reached from the year grid,
// Data and sources from the footer, so neither is here.
export const NAV_ITEMS = [
  { key: "race", label: "Race", href: "/" },
  { key: "awards", label: "Awards", href: "/awards" },
  { key: "grid", label: "Year grid", href: "/grid" },
  { key: "accuracy", label: "Accuracy", href: "/accuracy" },
  { key: "submissions", label: "Submissions", href: "/submissions" },
  { key: "festivals", label: "Festivals", href: "/festivals" },
  { key: "watch-list", label: "Watch list", href: "/watch-list" },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];

/** The nav item a path belongs to, or null (movie pages, /data, the styleguide). */
export function currentNav(pathname: string): NavKey | null {
  if (pathname === "/" || pathname.startsWith("/race/")) return "race";
  for (const item of NAV_ITEMS) {
    if (item.href !== "/" && (pathname === item.href || pathname.startsWith(`${item.href}/`))) return item.key;
  }
  return null;
}
