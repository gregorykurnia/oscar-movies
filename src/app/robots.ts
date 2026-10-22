import type { MetadataRoute } from "next";

// Search engines stay out (plan §10): robots.txt disallows every crawler.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
