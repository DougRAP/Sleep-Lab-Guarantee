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
import type { Claim, EarlyPreference } from "./types";

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
