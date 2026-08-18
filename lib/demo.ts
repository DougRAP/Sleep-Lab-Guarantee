// lib/demo.ts
// Demo day-jumper — pure helpers (no next/headers, unit-testable).
//
// Fail-closed (audit 2026-07-28): demo mode is OFF unless NEXT_PUBLIC_DEMO_MODE
// is explicitly "true". It never mutates a real record: the chosen day lives in
// its own cookie and is converted into an *effective reference date* passed to
// the existing journey/eligibility engine (which already accepts `referenceDate`).
// Turning it on lets the day-jumper move the eligibility window (a demo tool), so
// it must be an explicit opt-in — an unconfigured deploy stays safe by default.

/** Separate from the session cookie on purpose — never touches real state. */
export const DEMO_DAY_COOKIE = "rap_demo_day";

/** Presets offered by the control, plus free entry. */
export const DEMO_DAY_PRESETS = [0, 12, 31, 60, 90, 91] as const;

/** Clamp bounds for free entry (a year of journey covers every phase). */
export const DEMO_DAY_MIN = 0;
export const DEMO_DAY_MAX = 365;

/**
 * True when the demo control is active. FAIL-CLOSED (audit 2026-07-28): the
 * day-jumper can move the eligibility window, so it is OFF unless explicitly
 * enabled with NEXT_PUBLIC_DEMO_MODE="true". An unset or empty value is off, so
 * a deploy that forgets the flag can't expose the day-jumper to real customers.
 */
export function isDemoMode(
  value: string | undefined = process.env.NEXT_PUBLIC_DEMO_MODE
): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Claims-mode demo cut: hides the sleep-companion layer (Tonight, Coach, Shop)
 * so only the guarantee/claims surfaces show. Unlike the demo day-jumper this
 * defaults OFF — it is on only when NEXT_PUBLIC_CLAIMS_MODE is exactly "true".
 * No code is removed anywhere; every surface is gated on this flag.
 */
export function isClaimsMode(
  value: string | undefined = process.env.NEXT_PUBLIC_CLAIMS_MODE
): boolean {
  return value?.trim() === "true";
}

/** Parse a cookie/form value into a valid effective day, or null if unusable. */
export function parseDemoDay(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  const day = Math.trunc(n);
  if (day < DEMO_DAY_MIN || day > DEMO_DAY_MAX) return null;
  return day;
}

/** Local calendar date parts of an ISO (YYYY-MM-DD) or Date value. */
function parts(value: string | Date): { y: number; m: number; d: number } {
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
    const parsed = new Date(value);
    return { y: parsed.getFullYear(), m: parsed.getMonth(), d: parsed.getDate() };
  }
  return { y: value.getFullYear(), m: value.getMonth(), d: value.getDate() };
}

/**
 * The reference date at which `journeyDay(deliveryDate, ref) === day`.
 * Local midnight so it lines up with the engine's calendar-day math.
 */
export function referenceDateForDay(deliveryDate: string | Date, day: number): Date {
  const p = parts(deliveryDate);
  return new Date(p.y, p.m, p.d + day);
}

/**
 * Resolve the reference date to evaluate a journey with: the demo override when
 * demo mode is on AND a day has been chosen, otherwise real "now".
 */
export function resolveReferenceDate(
  deliveryDate: string | Date,
  demoDay: number | null,
  now: Date = new Date()
): Date {
  if (demoDay === null) return now;
  return referenceDateForDay(deliveryDate, demoDay);
}
