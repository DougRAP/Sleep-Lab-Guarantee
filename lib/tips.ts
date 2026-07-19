// lib/tips.ts
// Tunable-content selection (PRD §2a, §6). Pure functions — no I/O — so the
// repository layer and tests can share one deterministic selection rule.

import type { JourneyPhase, TimeOfDay, Tip } from "./types";

/** Bucket a clock hour into the tip content's time-of-day dimension. */
export function timeOfDayFor(date: Date = new Date()): TimeOfDay {
  const h = date.getHours();
  if (h >= 5 && h <= 11) return "morning";
  if (h >= 12 && h <= 16) return "day";
  if (h >= 17 && h <= 21) return "evening";
  return "night";
}

export interface TipQuery {
  day: number;
  phase: JourneyPhase;
  /** Optional. When given, time-appropriate tips are preferred (soft, not hard). */
  timeOfDay?: TimeOfDay;
}

function dayMatches(tip: Tip, day: number): boolean {
  const lo = tip.dayMin ?? Number.NEGATIVE_INFINITY;
  const hi = tip.dayMax ?? Number.POSITIVE_INFINITY;
  return day >= lo && day <= hi;
}

function phaseMatches(tip: Tip, phase: JourneyPhase): boolean {
  return tip.phase == null || tip.phase === "any" || tip.phase === phase;
}

/** More-specific matches score higher; ties broken deterministically by id. */
function score(tip: Tip, q: TipQuery): number {
  let s = 0;
  if (q.timeOfDay && tip.timeOfDay === q.timeOfDay) s += 4; // exact time-of-day
  if (tip.phase && tip.phase !== "any") s += 2; // phase-specific
  const span = (tip.dayMax ?? 90) - (tip.dayMin ?? 0);
  s += Math.max(0, 3 - Math.floor(span / 15)); // narrower day window wins
  return s;
}

/**
 * Pick the single best tip for a journey day + phase (optionally time-of-day).
 * time-of-day is a preference: if no time-appropriate tip exists we fall back to
 * any active day/phase tip so Tonight always has something calm to show.
 */
export function selectTip(tips: Tip[], q: TipQuery): Tip | null {
  const base = tips.filter(
    (t) => t.active && dayMatches(t, q.day) && phaseMatches(t, q.phase)
  );
  if (base.length === 0) return null;

  const timed = q.timeOfDay
    ? base.filter((t) => t.timeOfDay === "any" || t.timeOfDay === q.timeOfDay)
    : base;
  const pool = timed.length > 0 ? timed : base;

  return [...pool].sort((a, b) => {
    const d = score(b, q) - score(a, q);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  })[0];
}
