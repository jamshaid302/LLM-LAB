import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
    // Model-backed tests are slower than typical unit tests.
    testTimeout: 30_000,
  },
});
