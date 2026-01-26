const { version } = require("./package.json");

const buildTimestamp =
  process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? new Date().toISOString();
const commitHash =
  process.env.NEXT_PUBLIC_APP_COMMIT ??
  process.env.GIT_COMMIT ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  "dev";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Enables a minimal production bundle for Docker images:
  // `next build` will create `.next/standalone` with only needed deps.
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_COMMIT: commitHash,
    NEXT_PUBLIC_BUILD_TIMESTAMP: buildTimestamp,
  },
};

module.exports = nextConfig;
