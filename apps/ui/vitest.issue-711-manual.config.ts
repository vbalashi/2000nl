import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/manual/issue-711-scheduler-bench.test.ts"],
    environment: "node",
    globals: true,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
