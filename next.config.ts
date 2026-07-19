import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // eslint-config-next 15.0.0 is incompatible with Next 15.5's ESLint runner
  // (passes removed options). Lint runs separately; don't fail builds on it.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // The fitting uploads camera captures through a server action. They're
    // downscaled client-side first (components/fitting/downscale.ts), but the
    // 1MB default is still too tight for a detailed law-tag shot.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
