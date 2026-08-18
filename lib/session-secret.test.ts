// lib/session-secret.test.ts
// P0 (audit 2026-07-28) — the light-verify cookie is only as safe as SESSION_SECRET.
// If it is missing, session.ts used to fall back to a PUBLIC default string,
// which in production would let anyone forge a session for any guarantee. This
// pins the fix: in production, signing MUST fail closed rather than sign with an
// absent/known secret. Dev, test, and the e2e (next dev) keep the fallback so
// local runs never break.

import { describe, it, expect, afterEach, vi } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

const STRONG = "a-strong-32-byte-secret-value-1234567890AB";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SESSION_SECRET fail-closed in production", () => {
  it("throws in production when SESSION_SECRET is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => createSessionToken("g1")).toThrow(/SESSION_SECRET/i);
  });

  it("throws in production when SESSION_SECRET is the known dev default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "dev-insecure-session-secret-change-me");
    expect(() => createSessionToken("g1")).toThrow(/SESSION_SECRET/i);
  });

  it("signs and round-trips in production with a strong secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", STRONG);
    const token = createSessionToken("g1");
    expect(token).toBeTruthy();
    expect(verifySessionToken(token)?.guaranteeId).toBe("g1");
  });

  it("keeps the dev fallback outside production (local build, tests, e2e)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => createSessionToken("g1")).not.toThrow();
    const token = createSessionToken("g1");
    expect(verifySessionToken(token)?.guaranteeId).toBe("g1");
  });
});
