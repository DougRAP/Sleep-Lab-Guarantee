import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke e2e for the 2026-07-22 review punch list. Runs against `next dev` on
 * its own port with the Supabase env BLANKED, so everything exercises the
 * in-memory fallback: light-verify entry, seeded requests, the demo staff
 * picker. Nothing here touches the real database.
 *
 * This suite is the COMPANION product: it opts out of claims mode explicitly.
 * The product that actually ships is covered by `playwright.claims.config.ts`,
 * and `npm run test:e2e` runs the two in sequence. Sequence matters: two
 * `next dev` on one project fight over `.next/trace` and both die (EPERM on
 * Windows), and giving them separate build directories makes Next rewrite
 * tracked `tsconfig.json` on every run. One at a time costs a recompile and
 * nothing else.
 */
export default defineConfig({
  testDir: "./e2e",
  // Each of these has its own config and its own server: the claims suite
  // (playwright.claims.config.ts) and the headed walkthrough (e2e/walk, run by
  // hand with playwright.walk.config.ts). Neither belongs in this run.
  testIgnore: ["**/claims/**", "**/walk/**"],
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Blank strings beat .env.local (Next.js never overrides existing env),
      // forcing the zero-config in-memory backend.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      ANTHROPIC_API_KEY: "",
      NEXT_PUBLIC_DEMO_MODE: "true",
      // Clear of a developer's own `npm run dev`, which owns .next/trace.
      NEXT_DIST_DIR: ".next-e2e",
      // v3 (M-S3): claims mode is the product default now. This smoke suite
      // exercises the companion journey (entry -> Tonight -> the fitting), so
      // it opts out explicitly. A claims-mode e2e is its own suite.
      NEXT_PUBLIC_CLAIMS_MODE: "false",
    },
  },
});
