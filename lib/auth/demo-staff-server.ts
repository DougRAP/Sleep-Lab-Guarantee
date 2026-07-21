// lib/auth/demo-staff-server.ts
// Server-side accessors for the demo staff viewer cookie. Separated from
// ./demo-staff.ts so the refusal logic stays pure and unit-testable (this file
// pulls next/headers).
//
// Every function here re-checks demoStaffBlocked() itself — the refusal never
// depends on a caller remembering to. When Supabase is configured in any form,
// reads return null and writes are no-ops, so the cookie can never shadow the
// real getViewer() path.

import { cookies } from "next/headers";
import {
  DEMO_STAFF_COOKIE,
  demoStaffBlocked,
  demoStaffCookieValue,
  resolveDemoStaff,
  type DemoStaffRole,
  type DemoStaffView,
} from "./demo-staff";

/** A day is plenty for a demo session (matches the demo day-jumper's cookie). */
const MAX_AGE_SECONDS = 60 * 60 * 24;

/** The demo staff view, or null — ALWAYS null when Supabase is configured. */
export async function getDemoStaffView(): Promise<DemoStaffView | null> {
  // Refusal (a): never even read the cookie once Supabase is configured.
  if (demoStaffBlocked()) return null;
  const store = await cookies();
  return resolveDemoStaff(store.get(DEMO_STAFF_COOKIE)?.value ?? null);
}

/**
 * Persist a chosen demo view. Returns false — writing nothing — when Supabase
 * is configured (refusal (b): the setter refuses exactly like the reader).
 */
export async function setDemoStaffView(role: DemoStaffRole): Promise<boolean> {
  if (demoStaffBlocked()) return false;
  const store = await cookies();
  store.set(DEMO_STAFF_COOKIE, demoStaffCookieValue(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return true;
}

/** Drop the demo view (the "switch view" action). Always safe. */
export async function clearDemoStaffView(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_STAFF_COOKIE);
}
