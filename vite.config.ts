import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // Three.js alone is about 500 kB and is needed on the app's only page, so splitting
    // it wouldn't load anything later. Review if the app gains more pages.
    chunkSizeWarningLimit: 700,
  },
});
