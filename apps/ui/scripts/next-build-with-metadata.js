#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const uiRoot = path.resolve(__dirname, "..");

const envNonEmpty = (value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const runGit = (args) => {
  const res = spawnSync("git", args, { cwd: uiRoot, encoding: "utf8" });
  if (res.status !== 0) return null;
  return String(res.stdout || "").trim() || null;
};

const safeInt = (value, fallback = 0) => {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
};

const computeVersion = () => {
  // Deploy computes a SemVer-like version from git tags (vMAJOR.MINOR.PATCHBASE)
  // where PATCH is "number of commits since latest tag". Mirror that locally.
  const { version: pkgVersion } = require(path.join(uiRoot, "package.json"));

  const tag =
    runGit(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"]) || null;
  const base = tag ? tag.replace(/^v/, "") : pkgVersion;

  const [majorS, minorS] = String(base).split(".");
  const major = safeInt(majorS, 0);
  const minor = safeInt(minorS, 0);

  const patch = tag
    ? safeInt(runGit(["rev-list", `${tag}..HEAD`, "--count"]), 0)
    : 0;

  return `${major}.${minor}.${patch}`;
};

const nextBin = path.join(
  uiRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
);

const env = { ...process.env };
env.NEXT_PUBLIC_BUILD_TIMESTAMP =
  envNonEmpty(env.NEXT_PUBLIC_BUILD_TIMESTAMP) ?? new Date().toISOString();
env.NEXT_PUBLIC_APP_COMMIT =
  envNonEmpty(env.NEXT_PUBLIC_APP_COMMIT) ?? runGit(["rev-parse", "HEAD"]) ?? "dev";
env.NEXT_PUBLIC_APP_VERSION =
  envNonEmpty(env.NEXT_PUBLIC_APP_VERSION) ?? computeVersion();

console.log(
  `next build (appVersion=${env.NEXT_PUBLIC_APP_VERSION} commit=${String(env.NEXT_PUBLIC_APP_COMMIT).slice(0, 8)} ts=${env.NEXT_PUBLIC_BUILD_TIMESTAMP})`
);

const res = spawnSync(nextBin, ["build"], { cwd: uiRoot, stdio: "inherit", env });
process.exit(res.status ?? 1);

