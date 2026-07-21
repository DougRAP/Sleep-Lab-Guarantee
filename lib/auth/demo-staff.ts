// lib/auth/demo-staff.ts
// The DEMO staff viewer — pure logic, no next/headers, so the refusal rules are
// directly testable (the server accessors live in ./demo-staff-server.ts).
//
// When Supabase is not configured there is no way to prove a staff role, and
// the old /admin answer was a dead "not switched on" card. This module lets a
// demo visitor pick one of exactly two canned views — the demo dealer
// (location "101") or RAP admin — held in an httpOnly cookie.
//
// SECURITY INVARIANTS (non-negotiable):
//  (a) The cookie is only ever honored when Supabase is ENTIRELY unconfigured —
//      `demoStaffBlocked()` refuses when the auth keys OR the data keys are
//      present, so this can never shadow real auth (mirrors how verifyEntry
//      refuses in lib/actions/verify.ts) and can never scope real Supabase rows.
//  (b) The values are a closed set: "rap_admin" and "dealer:101". A tampered
//      cookie can only ever name one of the two demo views — the dealer view is
//      hard-scoped to DEMO_DEALER_LOCATION_ID, never a location of the
//      visitor's choosing.

import { isAuthConfigured } from "./config";

export const DEMO_STAFF_COOKIE = "rap_demo_staff";

/** The one location the demo dealer view can ever see (the seed's dealer). */
export const DEMO_DEALER_LOCATION_ID = "101";

export type DemoStaffRole = "dealer" | "rap_admin";

export interface DemoStaffView {
  role: DemoStaffRole;
  /** Always DEMO_DEALER_LOCATION_ID for the dealer view; null for RAP. */
  dealerLocationId: string | null;
}

/**
 * True when the demo staff viewer must refuse to exist. Checks BOTH switches:
 * the auth switch (isAuthConfigured — real accounts are live) and the data
 * switch (URL + service key — the repository reads real Supabase rows; a demo
 * cookie must never scope those). Mirrors lib/data/index.ts isSupabaseConfigured
 * without pulling the repository imports into a pure module.
 */
export function demoStaffBlocked(): boolean {
  return (
    isAuthConfigured() ||
    Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  );
}

/** The exact cookie value for a chosen demo role — the closed set's writer. */
export function demoStaffCookieValue(role: DemoStaffRole): string {
  return role === "dealer" ? `dealer:${DEMO_DEALER_LOCATION_ID}` : "rap_admin";
}

/**
 * Parse a raw cookie value. Only the two exact demo values resolve; anything
 * else — including "dealer:<any other location>" — is null.
 */
export function parseDemoStaffCookie(
  raw: string | null | undefined
): DemoStaffView | null {
  if (raw === "rap_admin") return { role: "rap_admin", dealerLocationId: null };
  if (raw === `dealer:${DEMO_DEALER_LOCATION_ID}`) {
    return { role: "dealer", dealerLocationId: DEMO_DEALER_LOCATION_ID };
  }
  return null;
}

/**
 * The full resolution: refuse outright when Supabase is configured in any form,
 * otherwise parse. `blocked` is injectable so the refusal is unit-testable;
 * callers rely on the env-backed default.
 */
export function resolveDemoStaff(
  raw: string | null | undefined,
  blocked: boolean = demoStaffBlocked()
): DemoStaffView | null {
  if (blocked) return null;
  return parseDemoStaffCookie(raw);
}
