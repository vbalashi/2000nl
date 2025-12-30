/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Enables a minimal production bundle for Docker images:
  // `next build` will create `.next/standalone` with only needed deps.
  output: 'standalone'
};

module.exports = nextConfig;
