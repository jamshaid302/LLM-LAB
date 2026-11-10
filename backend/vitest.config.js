import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    // Live tests need Mongo and Chroma running. They run with `npm run test:live`.
    exclude: ["tests/live/**", "node_modules/**"],
    environment: "node",
    // Model-backed tests are slower than typical unit tests.
    testTimeout: 30_000,
  },
});
