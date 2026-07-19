// lib/demo-server.ts
// Server-side accessors for the demo day-jumper. Separated from lib/demo.ts so
// the pure logic stays unit-testable (this file pulls next/headers).
//
// The demo day lives in its OWN cookie (rap_demo_day) — the signed session and
// every persisted record are untouched. When demo mode is off, reads always
// return null, so the app behaves exactly as it would in production.

import { cookies } from "next/headers";
import {
  DEMO_DAY_COOKIE,
  isDemoMode,
  parseDemoDay,
  resolveReferenceDate,
} from "./demo";

const MAX_AGE_SECONDS = 60 * 60 * 24; // a day is plenty for a demo session

/** The chosen effective journey day, or null when unset/disabled. */
export async function getDemoDay(): Promise<number | null> {
  if (!isDemoMode()) return null;
  const store = await cookies();
  return parseDemoDay(store.get(DEMO_DAY_COOKIE)?.value ?? null);
}

/** Persist the chosen effective day (no-op when demo mode is off). */
export async function setDemoDay(day: number): Promise<void> {
  if (!isDemoMode()) return;
  const store = await cookies();
  store.set(DEMO_DAY_COOKIE, String(day), {
    httpOnly: false, // read-only preview state; not a credential
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearDemoDay(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_DAY_COOKIE);
}

/**
 * The reference date every journey/eligibility read should use: the demo
 * override when one is set, otherwise real now. Pass this to
 * `repo.getJourney(id, ref)` and `evaluateEligibility({ referenceDate })`.
 */
export async function effectiveReferenceDate(
  deliveryDate: string | Date
): Promise<Date> {
  return resolveReferenceDate(deliveryDate, await getDemoDay());
}
