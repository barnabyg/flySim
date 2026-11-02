import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    bail: process.env.CI ? 1 : 0,
    // Statistical tests simulate many simulated hours, and some several days, so a busy
    // machine running files side by side can take a while.
    testTimeout: 180_000,
  },
});
