// lib/auth/demo-staff.test.ts
// The demo staff viewer's two rules: the cookie is a CLOSED set of two views
// (tampering can't mint a third), and the whole mechanism refuses to exist the
// moment Supabase is configured in any form — so it can never shadow real auth.

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  DEMO_DEALER_LOCATION_ID,
  demoStaffBlocked,
  demoStaffCookieValue,
  parseDemoStaffCookie,
  resolveDemoStaff,
} from "./demo-staff";

/** The keyless fallback — the only world where the demo viewer may exist. */
function stubUnconfigured() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseDemoStaffCookie — a closed set of two views", () => {
  it("resolves the RAP admin view", () => {
    expect(parseDemoStaffCookie("rap_admin")).toEqual({
      role: "rap_admin",
      dealerLocationId: null,
    });
  });

  it("resolves the demo dealer view, hard-scoped to the demo location", () => {
    expect(parseDemoStaffCookie(`dealer:${DEMO_DEALER_LOCATION_ID}`)).toEqual({
      role: "dealer",
      dealerLocationId: DEMO_DEALER_LOCATION_ID,
    });
  });

  it("refuses a dealer view for any OTHER location — the cookie can't pick one", () => {
    expect(parseDemoStaffCookie("dealer:202")).toBeNull();
    expect(parseDemoStaffCookie("dealer:")).toBeNull();
    expect(parseDemoStaffCookie("dealer")).toBeNull();
  });

  it("refuses everything else", () => {
    expect(parseDemoStaffCookie(null)).toBeNull();
    expect(parseDemoStaffCookie(undefined)).toBeNull();
    expect(parseDemoStaffCookie("")).toBeNull();
    expect(parseDemoStaffCookie("consumer")).toBeNull();
    expect(parseDemoStaffCookie("rap_admin ")).toBeNull();
    expect(parseDemoStaffCookie(`dealer:${DEMO_DEALER_LOCATION_ID}x`)).toBeNull();
  });

  it("round-trips the writer's exact values", () => {
    expect(parseDemoStaffCookie(demoStaffCookieValue("rap_admin"))?.role).toBe(
      "rap_admin"
    );
    expect(parseDemoStaffCookie(demoStaffCookieValue("dealer"))).toEqual({
      role: "dealer",
      dealerLocationId: DEMO_DEALER_LOCATION_ID,
    });
  });
});

describe("resolveDemoStaff — refuses whenever Supabase is configured", () => {
  it("resolves in the keyless fallback (the demo the app runs today)", () => {
    stubUnconfigured();
    expect(resolveDemoStaff("rap_admin")).not.toBeNull();
    expect(resolveDemoStaff(demoStaffCookieValue("dealer"))?.dealerLocationId).toBe(
      DEMO_DEALER_LOCATION_ID
    );
  });

  it("refuses when the AUTH keys are set — real roles take over, exactly like verifyEntry", () => {
    stubUnconfigured();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(resolveDemoStaff("rap_admin")).toBeNull();
    expect(resolveDemoStaff(demoStaffCookieValue("dealer"))).toBeNull();
  });

  it("refuses when the DATA keys are set — a demo cookie must never scope real rows", () => {
    stubUnconfigured();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    expect(resolveDemoStaff("rap_admin")).toBeNull();
  });

  it("refuses with everything set (a fully configured deployment)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    expect(resolveDemoStaff("rap_admin")).toBeNull();
    expect(demoStaffBlocked()).toBe(true);
  });

  it("demoStaffBlocked is false only in the keyless fallback", () => {
    stubUnconfigured();
    expect(demoStaffBlocked()).toBe(false);
  });
});
