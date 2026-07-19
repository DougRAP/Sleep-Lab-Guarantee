import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // eslint-config-next 15.0.0 is incompatible with Next 15.5's ESLint runner
  // (passes removed options). Lint runs separately; don't fail builds on it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
