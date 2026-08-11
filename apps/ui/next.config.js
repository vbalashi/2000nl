const { version: baseVersion } = require("./package.json");
const rolloutProfiles = require("./config/rollout-profiles.json");

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

// Version is derived from git tags by deploy pipeline (e.g. 0.16.3).
// For local dev, fall back to package.json version.
const appVersion =
  envNonEmpty(process.env.NEXT_PUBLIC_APP_VERSION) ??
  envNonEmpty(process.env.APP_VERSION) ??
  baseVersion;

// Keep server-wide audio defaults available to the client UI.
// This is not sensitive, and avoids the UI hard-defaulting to "free" when the
// server is configured with `AUDIO_QUALITY_DEFAULT=premium`.
const audioQualityDefault =
  envNonEmpty(process.env.NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT) ??
  envNonEmpty(process.env.AUDIO_QUALITY_DEFAULT) ??
  "free";

const rolloutProfileName =
  envNonEmpty(process.env.APP_ROLLOUT_PROFILE) ?? "legacy";
const rolloutProfile = rolloutProfiles[rolloutProfileName];

if (!rolloutProfile) {
  throw new Error(
    `Unknown APP_ROLLOUT_PROFILE "${rolloutProfileName}". Expected one of: ${Object.keys(
      rolloutProfiles,
    ).join(", ")}.`,
  );
}

const rolloutEnv = Object.fromEntries(
  Object.entries(rolloutProfile).map(([name, enabled]) => [
    name,
    enabled ? "true" : "false",
  ]),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Local preview wrappers use a dedicated cache directory so a concurrent
  // production build cannot overwrite chunks served by `next dev`.
  distDir: envNonEmpty(process.env.NEXT_DIST_DIR) ?? ".next",
  // Enables a minimal production bundle for Docker images:
  // `next build` will create `.next/standalone` with only needed deps.
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_APP_COMMIT: commitHash,
    NEXT_PUBLIC_BUILD_TIMESTAMP: buildTimestamp,
    NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT: audioQualityDefault,
    NEXT_PUBLIC_APP_ROLLOUT_PROFILE: rolloutProfileName,
    ...rolloutEnv,
  },
};

module.exports = nextConfig;
