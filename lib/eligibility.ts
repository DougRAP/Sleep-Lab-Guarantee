// lib/eligibility.ts
// Server-authoritative comfort-guarantee rules engine (PRD §5).
// Pure functions only — no I/O, no `Date.now()` side effects except the
// `referenceDate` default. All decisions carry citable { ruleId, message }
// reasons so admin decisions and consumer copy trace back to a term.

import type { JourneyPhase } from "./types";

/** Last day of the "settle in" adjustment period. Exchange is not offered yet. */
export const SETTLE_IN_LAST_DAY = 30;
/** First day the comfort exchange is available (off-by-one fix: 31, not 30). */
export const WINDOW_OPEN_DAY = 31;
/** Last day of the 90-night window (inclusive). */
export const WINDOW_CLOSE_DAY = 90;

/** Config value; RAP-tunable. The dev team wires the live charge (Stripe seam). */
export const RESTOCKING_FEE = 99;

export interface EligibilityReason {
  ruleId: string;
  message: string;
}

/**
 * Catalog of citable terms (PRD §5). The date/one-time rules are evaluated by
 * `evaluateEligibility`; the rest are attestation/selection terms surfaced by
 * the fitting flow and admin review in later milestones.
 */
export const RULES = {
  WINDOW_OPEN: {
    id: "window_open",
    message: `Your one-time comfort exchange is available now (days ${WINDOW_OPEN_DAY}–${WINDOW_CLOSE_DAY} of the 90-night period).`,
  },
  ADJUSTMENT_PERIOD: {
    id: "adjustment_period",
    message: `We recommend giving a new mattress 4–6 weeks to settle in. The comfort exchange opens on day ${WINDOW_OPEN_DAY}.`,
  },
  WINDOW_CLOSED: {
    id: "window_closed",
    message: `The 90-night comfort exchange window closed on day ${WINDOW_CLOSE_DAY}.`,
  },
  ONE_TIME_ONLY: {
    id: "one_time_only",
    message:
      "The Comfort Guarantee includes a single one-time exchange, which has already been used.",
  },
  // Informational catalog (non-date terms) — cited by the fitting / admin later.
  EQUAL_OR_GREATER_VALUE: {
    id: "equal_or_greater_value",
    message:
      "The replacement must be in-stock and of equal or greater value; any price difference is paid at the dealer.",
  },
  RESTOCKING_FEE: {
    id: "restocking_fee",
    message: `A $${RESTOCKING_FEE} restocking fee applies at the time of exchange.`,
  },
  BOTH_PARTNERS_PRESENT: {
    id: "both_partners_present",
    message: "Both sleep partners should be present in-store to select the replacement.",
  },
  TAGS_LEGIBLE: {
    id: "tags_legible",
    message:
      "The law tag and model label must be attached, legible, and unaltered (removal voids the guarantee).",
  },
  LIKE_NEW_CONDITION: {
    id: "like_new_condition",
    message: "The mattress must be in like-new, sanitary condition.",
  },
  US_ORIGINAL_DEALER: {
    id: "us_original_dealer",
    message: "Available in the US only, through the original dealer and location.",
  },
} as const;

/** Normalize a date-ish value to a UTC-midnight timestamp for calendar-day math. */
function toCalendarUTC(value: string | Date): number {
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(value);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * Whole calendar days since delivery. The delivery date itself is day 0.
 * DST-safe (compares calendar dates, not elapsed hours).
 */
export function journeyDay(
  deliveryDate: string | Date,
  referenceDate: string | Date = new Date()
): number {
  const ms = toCalendarUTC(referenceDate) - toCalendarUTC(deliveryDate);
  return Math.floor(ms / 86_400_000);
}

/**
 * The journey phase for a given day. A completed/approved exchange resolves the
 * journey regardless of day.
 */
export function journeyPhase(day: number, exchangeResolved = false): JourneyPhase {
  if (exchangeResolved) return "resolved";
  if (day <= SETTLE_IN_LAST_DAY) return "settle_in";
  if (day <= WINDOW_CLOSE_DAY) return "safety_net";
  return "expired";
}

export interface EligibilityInput {
  /** ISO date or Date. Start date for the 90-night window. */
  deliveryDate: string | Date;
  /** Defaults to now. Pass explicitly for deterministic evaluation/tests. */
  referenceDate?: string | Date;
  /** True if a prior comfort exchange is approved/completed (one-time rule). */
  exchangeResolved?: boolean;
}

export interface EligibilityResult {
  day: number;
  phase: JourneyPhase;
  eligible: boolean;
  windowOpensDay: number;
  windowClosesDay: number;
  /** Citable reasons for the decision (rule id + human message). */
  reasons: EligibilityReason[];
}

/** Evaluate comfort-exchange eligibility from delivery date + prior-exchange state. */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const day = journeyDay(input.deliveryDate, input.referenceDate ?? new Date());
  const exchangeResolved = Boolean(input.exchangeResolved);
  const phase = journeyPhase(day, exchangeResolved);

  const reasons: EligibilityReason[] = [];
  let eligible: boolean;

  if (exchangeResolved) {
    eligible = false;
    reasons.push({
      ruleId: RULES.ONE_TIME_ONLY.id,
      message: RULES.ONE_TIME_ONLY.message,
    });
  } else if (day < WINDOW_OPEN_DAY) {
    eligible = false;
    reasons.push({
      ruleId: RULES.ADJUSTMENT_PERIOD.id,
      message: `Today is day ${day}. ${RULES.ADJUSTMENT_PERIOD.message}`,
    });
  } else if (day > WINDOW_CLOSE_DAY) {
    eligible = false;
    reasons.push({
      ruleId: RULES.WINDOW_CLOSED.id,
      message: `Today is day ${day}. ${RULES.WINDOW_CLOSED.message}`,
    });
  } else {
    eligible = true;
    reasons.push({
      ruleId: RULES.WINDOW_OPEN.id,
      message: `Today is day ${day}. ${RULES.WINDOW_OPEN.message}`,
    });
  }

  return {
    day,
    phase,
    eligible,
    windowOpensDay: WINDOW_OPEN_DAY,
    windowClosesDay: WINDOW_CLOSE_DAY,
    reasons,
  };
}
