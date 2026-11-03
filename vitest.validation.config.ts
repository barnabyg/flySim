import { defineConfig } from "vitest/config";

/**
 * The validation suite: Virtual Assays of the Reference Fly against the Evidence Pack's Validation
 * Targets. It is slower than the engine tests, so it has its own command, npm run validate.
 */
export default defineConfig({
  test: {
    include: ["validation/**/*.validation.ts"],
    environment: "node",
    globalSetup: ["validation/globalSetup.ts"],
    bail: process.env.CI ? 1 : 0,
    // The runs themselves happen once, in the global setup, before any test.
    testTimeout: 10_000,
  },
});
