import type { NextConfig } from "next";

/**
 * B-13 Pieza 7: security headers, framework-native so they cover every SSR
 * route and the Netlify adapter emits them. Only the zero-risk set — nothing
 * that touches scripts, styles, Supabase images, or server actions:
 *  - X-Frame-Options DENY + CSP frame-ancestors 'none': no clickjacking.
 *  - nosniff: no MIME sniffing.
 *  - Referrer-Policy: don't leak full URLs off-site.
 *  - Permissions-Policy: deny camera/mic/geo (the fitting uses a plain file
 *    input, not getUserMedia, so this changes nothing for photo upload).
 *  - object-src 'none' / base-uri 'self': cheap injection hardening that can't
 *    break Next's inline hydration scripts (a strict script-src would — that
 *    needs nonces and is deliberately out of scope).
 *  - HSTS starts SHORT (1 day) on a days-old domain so a TLS problem is
 *    recoverable; ramp to a year once stable. No includeSubDomains/preload yet.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  { key: "Strict-Transport-Security", value: "max-age=86400" },
];

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
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
