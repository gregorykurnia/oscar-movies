import type { Metadata } from "next";
import { NotFoundPage } from "@/components/status-page/NotFoundPage";

// The title template ("… · Oscar Movies", task 0.9) adds the site name.
export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return <NotFoundPage />;
}
