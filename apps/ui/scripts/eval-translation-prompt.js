#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const viteNodeCli = path.join(
  __dirname,
  "..",
  "node_modules",
  "vite-node",
  "dist",
  "cli.mjs",
);
const runner = path.join(__dirname, "eval-translation-prompt.ts");
const result = spawnSync(process.execPath, [viteNodeCli, runner, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
