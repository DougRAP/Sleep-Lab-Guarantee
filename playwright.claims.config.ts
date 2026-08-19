import { defineConfig, devices } from "@playwright/test";

/**
 * The claims-mode suite: the product that actually ships (R-1, Aug 19).
 *
 * Until this existed, every e2e ran with NEXT_PUBLIC_CLAIMS_MODE="false" and so
 * exercised the companion journey. The path each real customer walks had no
 * integration coverage at all, which is where every one of Emy's findings sat.
 *
 * Its own port so a stale companion server can never be reused with the wrong
 * mode, and its own config so `npm run test:e2e` can run the two SEQUENTIALLY:
 * concurrent `next dev` processes on one project collide on `.next/trace`.
 *
 * Supabase blank, like the companion suite, so this runs the in-memory backend
 * and touches no real database. One consequence worth knowing: with no Supabase
 * there is no way to sign in, so this suite can only cover the anonymous
 * visitor. The signed-in and unlinked footer states are covered by the unit
 * tests over the pure rule in lib/shell.ts.
 */
export default defineConfig({
  testDir: "./e2e/claims",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3101",
    trace: "retain-on-failure",
  },
  projects: [{ name: "claims", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- -p 3101",
    url: "http://localhost:3101",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      ANTHROPIC_API_KEY: "",
      NEXT_PUBLIC_DEMO_MODE: "true",
      // Clear of a developer's own `npm run dev`, which owns .next/trace.
      NEXT_DIST_DIR: ".next-e2e",
      // Explicit rather than unset: a checkout whose .env.local says "false"
      // must not silently turn this into a second companion run.
      NEXT_PUBLIC_CLAIMS_MODE: "true",
    },
  },
});
