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
    NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT: audioQualityDefault,
  },
};

module.exports = nextConfig;
