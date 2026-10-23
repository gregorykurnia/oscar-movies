import type { NextConfig } from "next";
import { LIVE_YEAR } from "./src/lib/years";

const nextConfig: NextConfig = {
  // The end-to-end tests build into `.next-test` so they never share a folder with
  // `npm run dev` or `npm run preview` (tests/e2e/global-setup.ts).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // `/submissions`, `/awards` and `/festivals` open the live season's pages, `/accuracy` Picture (plan §4).
  async redirects() {
    return [
      { source: "/submissions", destination: `/submissions/${LIVE_YEAR}`, permanent: false },
      { source: "/awards", destination: `/awards/${LIVE_YEAR}`, permanent: false },
      { source: "/festivals", destination: `/festivals/${LIVE_YEAR}`, permanent: false },
      { source: "/accuracy", destination: "/accuracy/picture", permanent: false },
    ];
  },
  // Search engines stay out: every response says noindex, nofollow (plan §10).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
