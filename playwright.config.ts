import { defineConfig } from "@playwright/test";

const port = 5199;

export default defineConfig({
  testDir: "e2e",
  maxFailures: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
    // Headless Chromium has no GPU, so WebGL runs on the software rasteriser.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
