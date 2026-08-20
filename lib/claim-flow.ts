// lib/claim-flow.ts
// Pure rules for the v3 anonymous intake flow (spec §2–§3): entry-form
// validation, the day-count states and their calm copy, and what "ready to
// submit" means. No I/O — the server actions (lib/actions/claim.ts) and the
// tests share these so the flow and its rules can never drift apart.
//
// Copy note: the day-count messages are DRAFTS in the guide's voice (spec §7
// open question #1) — Doug approves the final wording.

import { WINDOW_CLOSE_DAY, WINDOW_OPEN_DAY, journeyDay } from "./eligibility";
import { CONFIRMATION_TERMS } from "./fitting";
import { phoneDigits, zipQuery } from "./data/repository";
import { formatPlainDate } from "./dates";
import type { Claim, EarlyPreference, FittingStep } from "./types";

/* -------------------------------------------------------------------------- */
/* Entry form (landing page): identify + contact in one form (spec §2.2)      */
/* -------------------------------------------------------------------------- */

// Same ceilings the fitting's actions apply to client-written lines.
const MAX_LINE_CHARS = 200;

export interface ClaimEntryInput {
  firstName: string;
  lastName: string;
  salesOrderNumber: string;
  deliveryZip: string;
  contactEmail: string;
  contactPhone: string;
}

export interface ClaimEntryValue {
  firstName: string;
  lastName: string;
  salesOrderNumber: string | null;
  deliveryZip: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export type ClaimEntryResult =
  | { ok: true; value: ClaimEntryValue }
  | { ok: false; error: string };

function line(value: string): string {
  return value.trim().slice(0, MAX_LINE_CHARS);
}

/** A light email shape check — calm, not a validator arms race. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * The entry rules, in the order a person would fix them:
 * first + last name required; sales order # OR delivery ZIP (either one is
 * fine); email OR mobile number (the exchange authorization arrives by text
 * or email). Failures are one calm sentence — no field-by-field red.
 */
export function validateClaimEntry(input: ClaimEntryInput): ClaimEntryResult {
  const firstName = line(input.firstName);
  const lastName = line(input.lastName);
  const salesOrderNumber = line(input.salesOrderNumber);
  const deliveryZip = line(input.deliveryZip);
  const contactEmail = line(input.contactEmail);
  const contactPhone = line(input.contactPhone);

  if (!firstName || !lastName) {
    return { ok: false, error: "Please share your first and last name." };
  }
  if (!salesOrderNumber && !deliveryZip) {
    return {
      ok: false,
      error:
        "Please add your sales order number or the ZIP code where your mattress was delivered — either one is fine.",
    };
  }
  if (deliveryZip && !zipQuery(deliveryZip)) {
    return {
      ok: false,
      error: "That ZIP code doesn't look quite right — five digits is all we need.",
    };
  }
  if (!contactEmail && !contactPhone) {
    return {
      ok: false,
      error:
        "Please add an email or a mobile number — we'll send your exchange authorization by text or email.",
    };
  }
  if (contactEmail && !looksLikeEmail(contactEmail)) {
    return {
      ok: false,
      error: "That email doesn't look quite right — mind giving it another look?",
    };
  }
  if (contactPhone && !phoneDigits(contactPhone)) {
    return {
      ok: false,
      error: "That phone number doesn't look quite right — mind giving it another look?",
    };
  }

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      salesOrderNumber: salesOrderNumber || null,
      deliveryZip: deliveryZip || null,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Day count (details step, spec §2.4)                                        */
/* -------------------------------------------------------------------------- */

export type DayCountState = "early" | "in_window" | "past_window";

export function dayCountState(day: number): DayCountState {
  if (day < WINDOW_OPEN_DAY) return "early";
  if (day <= WINDOW_CLOSE_DAY) return "in_window";
  return "past_window";
}

/** ISO date (YYYY-MM-DD) the exchange window opens: delivery day + 31. */
export function windowOpensOn(deliveryDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deliveryDate.trim());
  if (!m) return deliveryDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + WINDOW_OPEN_DAY);
  return d.toISOString().slice(0, 10);
}

/**
 * The calm one-liner for a self-reported delivery date. Never blocks: even
 * past the window the request goes through and an agent reviews (spec §2.4).
 */
export function dayCountMessage(deliveryDate: string, referenceDate?: string | Date): {
  day: number;
  state: DayCountState;
  message: string;
} {
  const day = journeyDay(deliveryDate, referenceDate ?? new Date());
  const state = dayCountState(day);
  if (state === "early") {
    return {
      day,
      state,
      message: `That makes today night ${day} — your exchange window opens on ${formatPlainDate(
        windowOpensOn(deliveryDate)
      )} (night ${WINDOW_OPEN_DAY}). You can still send this in now; just tell us how you'd like to handle the wait.`,
    };
  }
  if (state === "in_window") {
    return {
      day,
      state,
      message: `That makes today night ${day} of your ${WINDOW_CLOSE_DAY} — you're in your exchange window.`,
    };
  }
  return {
    day,
    state,
    message: `That makes today night ${day}, past the ${WINDOW_CLOSE_DAY}-night window. You can still send this in and an agent will take a look — a phone call can also help sort out the options.`,
  };
}

/* -------------------------------------------------------------------------- */
/* R-3 — dates that cannot both be true                                       */
/* -------------------------------------------------------------------------- */

/**
 * Emy, 2026-08-19: a request went through with purchase 08/04/2026 and delivery
 * 07/29/2026, delivered six days before it was bought, and the app answered
 * "That makes today night 21". Doug gave the two rules on the call: the claim
 * date should not come before the delivery date, and the delivery date should
 * not be later than today.
 *
 * A TYPO GUARD, not a policy gate. v3 never blocks a request from being sent
 * (before night 31 it goes through with a preference, past night 90 with a
 * warning, photos never gate) and none of that changes. What this refuses is
 * carrying two dates that describe an impossible history to the next step.
 *
 * There is deliberately no third rule for "purchase is not in the future". The
 * two above compose into it: purchase <= delivery <= today + graceDays. A third
 * rule written to the same threshold could never fire. Note the grace rides
 * along, so on the server a purchase may sit one day ahead — which is the same
 * timezone slack, and no rule stated to a one-day tolerance can separate a
 * purchase made "today" east of the server from one made "tomorrow" on it.
 */

export type DateCheck =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** Which field the message names, so the input can be marked. */
      field: "purchase" | "delivery";
    };

const OK: DateCheck = { ok: true };

/**
 * How many days ahead of a SERVER clock a delivery may still sit.
 *
 * journeyDay compares calendar dates, and for a Date it reads the LOCAL parts
 * of whichever machine is asking (lib/eligibility.ts, toCalendarUTC). The
 * customer types in their timezone; the server answers in its own, which is UTC
 * on Netlify. Across UTC-11 to UTC+14 the two calendar days differ by at most
 * one, so one day is exactly enough and no more: at zero, a customer taking
 * delivery this morning anywhere east of the server would be refused.
 *
 * The browser needs none of it. There the reference IS the customer's own
 * clock, so the gap is zero by construction and any grace only lets a typo of
 * "tomorrow" through. DetailsStep passes NO_GRACE for that reason.
 */
export const DELIVERY_GRACE_DAYS = 1;

/** For a caller whose reference date is the customer's own clock. */
export const NO_GRACE = 0;

/**
 * Are these two self-reported dates capable of both being true?
 *
 * Silent about a pair it cannot compare: "Please add both dates" in
 * saveClaimDetails already owns the empty, malformed and impossible-calendar
 * cases, and two rules speaking at once about one field helps nobody.
 */
export function validatePurchaseDates(
  purchaseDate: string,
  deliveryDate: string,
  referenceDate: string | Date = new Date(),
  graceDays: number = DELIVERY_GRACE_DAYS
): DateCheck {
  const purchase = plainCalendarDate(purchaseDate);
  const delivery = plainCalendarDate(deliveryDate);
  if (!purchase || !delivery) return OK;

  // Negative days-since-delivery means the delivery has not happened yet.
  if (journeyDay(delivery, referenceDate) < -graceDays) {
    return {
      ok: false,
      field: "delivery",
      error:
        "That delivery date is still ahead of us. The 90 nights start the day it arrives, so mind giving it another look?",
    };
  }

  // Days from purchase to delivery. Negative means it arrived before it was bought.
  if (journeyDay(purchase, delivery) < 0) {
    return {
      ok: false,
      field: "purchase",
      error:
        "That purchase date lands after the delivery date. Mind giving one of the two another look?",
    };
  }

  return OK;
}

/**
 * A date that is both well-formed AND real, or null.
 *
 * The shape alone is not enough. Date.UTC rolls over silently, so "2026-02-30"
 * would become March 2 and be weighed as a date the customer never typed: a
 * purchase of 2026-02-30 against a delivery of 2026-03-01 reads as ordered and
 * would be refused. Years under 100 are worse, remapped into the 1900s. The
 * round trip refuses both, and the pair falls to "Please add both dates".
 */
export function plainCalendarDate(value: string): string | null {
  const v = (value ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const back = new Date(Date.UTC(y, mo - 1, d));
  const real =
    back.getUTCFullYear() === y &&
    back.getUTCMonth() === mo - 1 &&
    back.getUTCDate() === d;
  return real ? v : null;
}

/** The before-day-31 choice is only asked, and only required, when early. */
export function earlyPreferenceRequired(day: number): boolean {
  return day < WINDOW_OPEN_DAY;
}

export const EARLY_PREFERENCES: readonly EarlyPreference[] = [
  "auto_submit_day_31",
  "agent_call",
];

export function isEarlyPreference(value: unknown): value is EarlyPreference {
  return EARLY_PREFERENCES.includes(value as EarlyPreference);
}

/* -------------------------------------------------------------------------- */
/* Readiness (submit gate, spec §2.5–§2.8)                                    */
/* -------------------------------------------------------------------------- */

/**
 * What must be true before the anonymous flow can submit. Photos NEVER gate
 * (spec §2.6). Contact is validated at entry; re-checked here so a tampered
 * or half-migrated draft can't slip through.
 */
export function claimReadyToSubmit(
  claim: Pick<
    Claim,
    | "lastName"
    | "contactEmail"
    | "contactPhone"
    | "modelNumber"
    | "purchaseDate"
    | "deliveryDate"
    | "confirmations"
    | "earlyPreference"
  >,
  referenceDate: Date = new Date()
): { ready: boolean; stillNeeded: string[] } {
  const stillNeeded: string[] = [];
  if (!claim.lastName?.trim()) stillNeeded.push("Your name");
  if (!claim.contactEmail?.trim() && !claim.contactPhone?.trim()) {
    stillNeeded.push("An email or a mobile number");
  }
  if (!claim.modelNumber?.trim()) stillNeeded.push("The mattress model number");
  if (!claim.purchaseDate?.trim()) stillNeeded.push("The purchase date");
  if (!claim.deliveryDate?.trim()) stillNeeded.push("The delivery date");

  const have = new Set(claim.confirmations ?? []);
  if (CONFIRMATION_TERMS.some((t) => !have.has(t.key))) {
    stillNeeded.push("The guarantee confirmations");
  }

  if (claim.deliveryDate?.trim()) {
    const day = journeyDay(claim.deliveryDate, referenceDate);
    if (earlyPreferenceRequired(day) && !claim.earlyPreference) {
      stillNeeded.push("How you'd like to handle the early start");
    }
  }

  return { ready: stillNeeded.length === 0, stillNeeded };
}

/* -------------------------------------------------------------------------- */
/* R-2 — the stage order behind the Back control (Aug 19 punch list)          */
/* -------------------------------------------------------------------------- */

// Emy: "Request exchange images — No Back Button." Doug: "That back button will
// be for all the application."
//
// The order lives here, not in the flow component, for the same reason
// FITTING_STEPS/previousStep() live in lib/fitting.ts: the control, the
// persistence and the tests must read one answer. `step` on the claim row is
// the legacy FittingStep column, so the two mappings below are what let a stage
// be stored and resumed without a schema change.

/** The screens of the v3 intake, in the order the customer walks them. */
export const CLAIM_STAGES = [
  "details",
  "qualification",
  "photos",
  "process",
  "done",
] as const;

export type ClaimStage = (typeof CLAIM_STAGES)[number];

/**
 * Where Back goes from here, or null when it has nowhere to go: `details` is
 * first (the entry form is a different page and the claim already exists), and
 * `done` has minted CG###### — there is no un-submitting it.
 */
export function previousStage(stage: ClaimStage): ClaimStage | null {
  if (stage === "done") return null;
  const i = CLAIM_STAGES.indexOf(stage);
  if (i <= 0) return null;
  return CLAIM_STAGES[i - 1];
}

/**
 * Whether moving from `from` to `to` is a step BACKWARD.
 *
 * The only legitimate caller of the stage action is Back, so this is the whole
 * of what it may do. Forward progress is persisted by the step actions
 * themselves, as a side effect of the work they validate.
 *
 * Adversarial review, 2026-08-19: without this the action accepted any stage,
 * `done` included, and `stepForStage("done")` is `"submitted"` — a client could
 * write that onto its own live draft and land in a state with no Back, no claim
 * number, and no route to the fields it still had to fill.
 */
export function isBackwardStage(from: ClaimStage, to: ClaimStage): boolean {
  return CLAIM_STAGES.indexOf(to) < CLAIM_STAGES.indexOf(from);
}

/** The stage a persisted `step` resumes at. Legacy values fold onto v3 stages. */
export function stageForStep(step: FittingStep): ClaimStage {
  const byStep: Record<FittingStep, ClaimStage> = {
    intake: "details",
    items: "details",
    confirmations: "qualification",
    photos: "photos",
    verify: "process",
    submitted: "done",
  };
  return byStep[step] ?? "details";
}

/** The `step` value a stage is stored as. Inverse of stageForStep. */
export function stepForStage(stage: ClaimStage): FittingStep {
  const byStage: Record<ClaimStage, FittingStep> = {
    details: "items",
    qualification: "confirmations",
    photos: "photos",
    process: "verify",
    done: "submitted",
  };
  return byStage[stage];
}
