import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["playwright/**", "node_modules/**"],
    environment: "jsdom",
    environmentMatchGlobs: [["tests/fsrs/**", "node"]],
    globals: true,
    setupFiles: "./vitest.setup.ts",
    // Run FSRS tests sequentially to avoid DB contention
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname)
    }
  }
});
