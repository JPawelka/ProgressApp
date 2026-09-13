/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    environment: "node",
    // Playwright lives under tests/*.spec.ts; Vitest must not load those files.
    include: ["src/**/*.test.ts"],
  },
});
