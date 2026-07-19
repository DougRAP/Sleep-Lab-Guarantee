// lib/demo.ts
// Demo day-jumper — pure helpers (no next/headers, unit-testable).
//
// Production IS the demo right now, so this defaults ON. It never mutates a real
// record: the chosen day lives in its own cookie and is converted into an
// *effective reference date* that is passed to the existing journey/eligibility
// engine (which already accepts `referenceDate`). Switch it off at launch by
// setting NEXT_PUBLIC_DEMO_MODE to anything other than "true" (e.g. "false").

/** Separate from the session cookie on purpose — never touches real state. */
export const DEMO_DAY_COOKIE = "rap_demo_day";

/** Presets offered by the control, plus free entry. */
export const DEMO_DAY_PRESETS = [0, 12, 31, 60, 90, 91] as const;

/** Clamp bounds for free entry (a year of journey covers every phase). */
export const DEMO_DAY_MIN = 0;
export const DEMO_DAY_MAX = 365;

/**
 * True when the demo control is active. Unset defaults to "true" (the current
 * production state is the demo); any other value turns it off entirely.
 */
export function isDemoMode(
  value: string | undefined = process.env.NEXT_PUBLIC_DEMO_MODE
): boolean {
  const raw = value?.trim();
  if (raw === undefined || raw === "") return true;
  return raw.toLowerCase() === "true";
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
