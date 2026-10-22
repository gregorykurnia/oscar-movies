import type { NextConfig } from "next";

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
