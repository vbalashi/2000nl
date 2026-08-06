import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";

const uiRoot = path.resolve(__dirname, "..");

function readDistDir(nextDistDir?: string) {
  const env = { ...process.env };
  if (nextDistDir) env.NEXT_DIST_DIR = nextDistDir;
  else delete env.NEXT_DIST_DIR;

  return execFileSync(
    process.execPath,
    ["-e", "process.stdout.write(require('./next.config.js').distDir)"],
    { cwd: uiRoot, env, encoding: "utf8" },
  );
}

describe("Next build directory isolation", () => {
  test("keeps production on .next by default", () => {
    expect(readDistDir()).toBe(".next");
  });

  test("allows the local dev wrapper to use an isolated directory", () => {
    expect(readDistDir(".next-dev")).toBe(".next-dev");
  });
});
