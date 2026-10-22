import { afterEach } from "vitest";

// Component tests run in jsdom (a `@vitest-environment jsdom` line at the top of the file);
// unmount what each test rendered. Plain logic tests run in node and skip this.
afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
