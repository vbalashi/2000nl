const { version: baseVersion } = require("./package.json");

const envNonEmpty = (value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const buildTimestamp =
  envNonEmpty(process.env.NEXT_PUBLIC_BUILD_TIMESTAMP) ??
  new Date().toISOString();
const commitHash =
  envNonEmpty(process.env.NEXT_PUBLIC_APP_COMMIT) ??
  envNonEmpty(process.env.GIT_COMMIT) ??
  envNonEmpty(process.env.VERCEL_GIT_COMMIT_SHA) ??
  "dev";

const normalizeForSemverMetadata = (value) =>
  String(value ?? "").replace(/[^0-9A-Za-z]+/g, "");

const commitShort = commitHash === "dev" ? "dev" : commitHash.slice(0, 8);
const buildId = normalizeForSemverMetadata(buildTimestamp) || "unknown";

// If the deploy pipeline provides an explicit version, use it.
// Otherwise, keep package.json's base version but make it change per build/deploy
// via semver build metadata: `0.1.0+<buildId>.<commitShort>`.
const computedAppVersion = `${baseVersion}+${buildId}.${commitShort}`;
const appVersion =
  envNonEmpty(process.env.NEXT_PUBLIC_APP_VERSION) ??
  envNonEmpty(process.env.APP_VERSION) ??
  computedAppVersion;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Enables a minimal production bundle for Docker images:
  // `next build` will create `.next/standalone` with only needed deps.
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_APP_COMMIT: commitHash,
    NEXT_PUBLIC_BUILD_TIMESTAMP: buildTimestamp,
  },
};

module.exports = nextConfig;
