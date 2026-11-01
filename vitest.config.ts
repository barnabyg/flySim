import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    bail: process.env.CI ? 1 : 0,
    // Statistical tests simulate many simulated hours, so a busy machine can take a while.
    testTimeout: 60_000,
  },
});
