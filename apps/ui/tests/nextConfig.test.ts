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

function readRolloutEnv(profile?: string) {
  const env = { ...process.env };
  if (profile) env.APP_ROLLOUT_PROFILE = profile;
  else delete env.APP_ROLLOUT_PROFILE;

  return JSON.parse(
    execFileSync(
      process.execPath,
      ["-e", "process.stdout.write(JSON.stringify(require('./next.config.js').env))"],
      { cwd: uiRoot, env, encoding: "utf8" },
    ),
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

describe("rollout profile compilation", () => {
  test("keeps ordinary builds on the legacy profile by default", () => {
    const env = readRolloutEnv();

    expect(env.NEXT_PUBLIC_APP_ROLLOUT_PROFILE).toBe("legacy");
    expect(env.NEXT_PUBLIC_PLATFORM_V2_TRAINING_UI).toBe("false");
    expect(env.NEXT_PUBLIC_DICTIONARY_SEARCH_V2).toBeUndefined();
  });

  test("compiles every approved pilot flag from one profile", () => {
    const env = readRolloutEnv("pilot");
    const flags = Object.entries(env).filter(([name]) =>
      name.includes("PLATFORM_V2") ||
      name.includes("NAVIGATION_SHELL") ||
      name.includes("SETTINGS_STATISTICS") ||
      name.includes("TRAINING_TODAY_SETUP"),
    );

    expect(env.NEXT_PUBLIC_APP_ROLLOUT_PROFILE).toBe("pilot");
    expect(env.NEXT_PUBLIC_DICTIONARY_SEARCH_V2).toBeUndefined();
    expect(flags).toHaveLength(7);
    expect(flags.every(([, value]) => value === "true")).toBe(true);
  });
});
