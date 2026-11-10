import { defineConfig } from "vitest/config";

// Talks to the real Mongo and Chroma from docker compose. Uses its own database and
// collection names and deletes them afterwards, so lab data is not touched.
export default defineConfig({
  test: {
    include: ["tests/live/**/*.live.test.js"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
