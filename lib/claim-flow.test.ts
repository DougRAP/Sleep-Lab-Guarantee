// lib/claim-flow.test.ts
// The pure rules of the v3 anonymous intake: the one-form entry validation,
// the day-count states at their boundaries, the early-preference rule, and
// what "ready to submit" means (photos never gate).

import { describe, expect, it } from "vitest";
import {
  CLAIM_STAGES,
  claimReadyToSubmit,
  dayCountMessage,
  dayCountState,
  earlyPreferenceRequired,
  NO_GRACE,
  isBackwardStage,
  plainCalendarDate,
  previousStage,
  stageForStep,
  stepForStage,
  validatePurchaseDates,
  validateClaimEntry,
  windowOpensOn,
} from "./claim-flow";
import { CLAIM_PHOTO_TARGETS, CONFIRMATION_KEYS } from "./fitting";
import type { ClaimEntryInput } from "./claim-flow";
import type { FittingStep } from "./types";

/** A fully valid entry; tests knock fields out one at a time. */
function entry(overrides: Partial<ClaimEntryInput> = {}): ClaimEntryInput {
  return {
    firstName: "Terri",
    lastName: "Osborne",
    salesOrderNumber: "1011099600S",
    deliveryZip: "28105",
    contactEmail: "terri@rapqa.com",
    contactPhone: "0005551340",
    ...overrides,
  };
}

describe("validateClaimEntry", () => {
  it("accepts a full entry and trims every field", () => {
    const res = validateClaimEntry(
      entry({ firstName: "  Terri ", deliveryZip: " 28105 " })
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.firstName).toBe("Terri");
      expect(res.value.deliveryZip).toBe("28105");
    }
  });

  it("requires both names", () => {
    expect(validateClaimEntry(entry({ firstName: "" })).ok).toBe(false);
    expect(validateClaimEntry(entry({ lastName: "  " })).ok).toBe(false);
  });

  it("order OR ZIP — either one is fine, neither is not", () => {
    expect(
      validateClaimEntry(entry({ salesOrderNumber: "", deliveryZip: "28105" })).ok
    ).toBe(true);
    expect(
      validateClaimEntry(entry({ salesOrderNumber: "1011099600S", deliveryZip: "" })).ok
    ).toBe(true);
    const neither = validateClaimEntry(
      entry({ salesOrderNumber: "", deliveryZip: "" })
    );
    expect(neither.ok).toBe(false);
    if (!neither.ok) expect(neither.error).toMatch(/either one is fine/i);
  });

  it("a ZIP, when given, is five digits", () => {
    expect(validateClaimEntry(entry({ deliveryZip: "2810" })).ok).toBe(false);
    expect(
      validateClaimEntry(entry({ salesOrderNumber: "", deliveryZip: "abcde" })).ok
    ).toBe(false);
  });

  it("email OR mobile — at least one, and it must look real", () => {
    expect(
      validateClaimEntry(entry({ contactEmail: "", contactPhone: "0005551340" })).ok
    ).toBe(true);
    expect(
      validateClaimEntry(entry({ contactEmail: "terri@rapqa.com", contactPhone: "" }))
        .ok
    ).toBe(true);
    const neither = validateClaimEntry(
      entry({ contactEmail: "", contactPhone: "" })
    );
    expect(neither.ok).toBe(false);
    if (!neither.ok) expect(neither.error).toMatch(/text or email/i);
    expect(validateClaimEntry(entry({ contactEmail: "not-an-email" })).ok).toBe(false);
    expect(
      validateClaimEntry(entry({ contactEmail: "", contactPhone: "12" })).ok
    ).toBe(false);
  });

  it("null-ifies blanks in the accepted value", () => {
    const res = validateClaimEntry(entry({ salesOrderNumber: "", contactPhone: "" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.salesOrderNumber).toBeNull();
      expect(res.value.contactPhone).toBeNull();
    }
  });

  it("fails calmly — no shouting, no ticket language", () => {
    const failures = [
      validateClaimEntry(entry({ firstName: "" })),
      validateClaimEntry(entry({ salesOrderNumber: "", deliveryZip: "" })),
      validateClaimEntry(entry({ contactEmail: "", contactPhone: "" })),
    ];
    for (const f of failures) {
      expect(f.ok).toBe(false);
      if (!f.ok) expect(f.error).not.toMatch(/!|error|invalid|ticket|submit a request/i);
    }
  });
});

describe("day-count boundaries (delivery = day 0)", () => {
  it.each([
    [5, "early"],
    [30, "early"],
    [31, "in_window"],
    [90, "in_window"],
    [91, "past_window"],
  ] as const)("day %i is %s", (day, state) => {
    expect(dayCountState(day)).toBe(state);
  });

  it("computes the message from a delivery date at each boundary", () => {
    const ref = "2026-08-18";
    // 5 nights in: early, names the opening date (delivery + 31).
    const early = dayCountMessage("2026-08-13", ref);
    expect(early.day).toBe(5);
    expect(early.state).toBe("early");
    expect(windowOpensOn("2026-08-13")).toBe("2026-09-13");
    // Day 31 exactly: in window.
    const opens = dayCountMessage("2026-07-18", ref);
    expect(opens.day).toBe(31);
    expect(opens.state).toBe("in_window");
    expect(opens.message).toMatch(/night 31/);
    // Day 90: still in window.
    expect(dayCountMessage("2026-05-20", ref).state).toBe("in_window");
    // Day 91: past, but the copy never blocks — it offers the agent + a call.
    const past = dayCountMessage("2026-05-19", ref);
    expect(past.day).toBe(91);
    expect(past.state).toBe("past_window");
    expect(past.message).toMatch(/still send/i);
  });

  it("requires the early choice only before day 31", () => {
    expect(earlyPreferenceRequired(5)).toBe(true);
    expect(earlyPreferenceRequired(30)).toBe(true);
    expect(earlyPreferenceRequired(31)).toBe(false);
    expect(earlyPreferenceRequired(91)).toBe(false);
  });
});

describe("claimReadyToSubmit", () => {
  const complete = {
    lastName: "Osborne",
    contactEmail: "terri@rapqa.com",
    contactPhone: null,
    modelNumber: "PL-2290",
    purchaseDate: "2026-06-01",
    deliveryDate: "2026-06-03",
    confirmations: [...CONFIRMATION_KEYS],
    earlyPreference: null,
  };
  const ref = new Date("2026-08-18T12:00:00Z"); // day 76 — in window

  it("is ready with details + confirmations and ZERO photos", () => {
    expect(claimReadyToSubmit(complete, ref).ready).toBe(true);
  });

  it("photos never gate — every v3 target is optional", () => {
    for (const target of CLAIM_PHOTO_TARGETS) {
      expect(target.optional).toBe(true);
    }
  });

  it("wants the details and the confirmations", () => {
    expect(claimReadyToSubmit({ ...complete, modelNumber: null }, ref).ready).toBe(false);
    expect(claimReadyToSubmit({ ...complete, deliveryDate: null }, ref).ready).toBe(false);
    expect(
      claimReadyToSubmit({ ...complete, confirmations: complete.confirmations.slice(1) }, ref)
        .ready
    ).toBe(false);
    expect(
      claimReadyToSubmit({ ...complete, contactEmail: null, contactPhone: null }, ref).ready
    ).toBe(false);
  });

  it("requires the early choice only when the date is early", () => {
    // Delivered 10 days before the reference — day 10, early.
    const earlyClaim = { ...complete, deliveryDate: "2026-08-08" };
    expect(claimReadyToSubmit(earlyClaim, ref).ready).toBe(false);
    expect(
      claimReadyToSubmit(
        { ...earlyClaim, earlyPreference: "agent_call" as const },
        ref
      ).ready
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* R-2 — the stage order behind the Back control                              */
/* -------------------------------------------------------------------------- */

// Emy: "Request exchange images — No Back Button." Doug: "That back button will
// be for all the application." The order lives here rather than in the flow
// component so the control, the persistence and these tests read one answer,
// exactly as previousStep()/FITTING_STEPS already do for the fitting.

describe("claim stages — where Back can go", () => {
  it("runs in the order the customer walks", () => {
    expect(CLAIM_STAGES).toEqual([
      "details",
      "qualification",
      "photos",
      "process",
      "done",
    ]);
  });

  it("has nowhere to go back to from the first stage", () => {
    // The entry form is a different page and the claim already exists.
    expect(previousStage("details")).toBeNull();
  });

  it("steps back one stage at a time", () => {
    expect(previousStage("qualification")).toBe("details");
    expect(previousStage("photos")).toBe("qualification");
    expect(previousStage("process")).toBe("photos");
  });

  it("offers no way back once the claim number exists", () => {
    // Submitting mints CG######. There is no un-submitting it.
    expect(previousStage("done")).toBeNull();
  });

  it("gives every persisted step a stage to resume at", () => {
    const steps: FittingStep[] = [
      "intake",
      "items",
      "confirmations",
      "photos",
      "verify",
      "submitted",
    ];
    for (const step of steps) {
      expect(CLAIM_STAGES).toContain(stageForStep(step));
    }
  });

  it("round-trips a stage through the column it is stored in", () => {
    // Going back has to persist the resume point, so the inverse must hold.
    for (const stage of CLAIM_STAGES) {
      expect(stageForStep(stepForStage(stage))).toBe(stage);
    }
  });
});

describe("stepping back is the only move the stage action may make", () => {
  // Adversarial review: saveClaimStage accepted any member of CLAIM_STAGES,
  // including "done" — and stepForStage("done") is "submitted", which poisoned
  // a live draft into a state with no Back and no way out. currentClaim()
  // validates the claim's STATUS, never its step, so the write landed.
  it("allows a move to an earlier stage", () => {
    expect(isBackwardStage("qualification", "details")).toBe(true);
    expect(isBackwardStage("process", "details")).toBe(true);
  });

  it("refuses standing still", () => {
    for (const stage of CLAIM_STAGES) {
      expect(isBackwardStage(stage, stage)).toBe(false);
    }
  });

  it("refuses a jump forward past the work", () => {
    expect(isBackwardStage("details", "process")).toBe(false);
    expect(isBackwardStage("details", "qualification")).toBe(false);
  });

  it("never lets a draft be marked done", () => {
    for (const stage of CLAIM_STAGES) {
      expect(isBackwardStage(stage, "done")).toBe(false);
    }
  });

  it("agrees with previousStage, which is the only caller", () => {
    for (const stage of CLAIM_STAGES) {
      const prev = previousStage(stage);
      if (prev) expect(isBackwardStage(stage, prev)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* R-3 — dates that cannot both be true                                       */
/* -------------------------------------------------------------------------- */

// Emy, 2026-08-19: filed with purchase 08/04/2026 and delivery 07/29/2026 —
// delivered six days before it was bought — and the app answered "night 21".
// Doug: "the date of the claim should not be before the delivery date" and
// "the date of delivery should not be greater than today's date".
//
// A typo guard, not a policy gate: nothing here stops a request from being
// SENT. Before night 31 and past night 90 both still submit.

const TODAY = "2026-08-20";

describe("purchase and delivery dates", () => {
  it("accepts an ordinary pair", () => {
    expect(validatePurchaseDates("2026-06-29", "2026-07-06", TODAY).ok).toBe(true);
  });

  it("accepts delivery on the same day it was bought", () => {
    expect(validatePurchaseDates("2026-07-06", "2026-07-06", TODAY).ok).toBe(true);
  });

  it("accepts a delivery that happened today", () => {
    expect(validatePurchaseDates("2026-08-01", TODAY, TODAY).ok).toBe(true);
  });

  it("tolerates one day ahead, because timezones", () => {
    // journeyDay compares the typed calendar date against the RUNTIME's local
    // one. A customer in a zone ahead of the server would otherwise be told
    // that this morning's delivery happens tomorrow.
    expect(validatePurchaseDates("2026-08-01", "2026-08-21", TODAY).ok).toBe(true);
  });

  it("refuses a delivery further ahead than that", () => {
    const check = validatePurchaseDates("2026-08-01", "2026-08-22", TODAY);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/delivery date/i);
  });

  it("refuses a purchase that lands after the delivery (Emy, 2026-08-19)", () => {
    const check = validatePurchaseDates("2026-08-04", "2026-07-29", TODAY);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/purchase date/i);
  });

  it("refuses one day of it, not just the obvious gaps", () => {
    expect(validatePurchaseDates("2026-07-07", "2026-07-06", TODAY).ok).toBe(false);
  });

  it("names the delivery first when both are wrong", () => {
    // The future delivery is the one that also breaks the night count, so it
    // is the one worth pointing at.
    const check = validatePurchaseDates("2026-09-30", "2026-08-25", TODAY);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/delivery date/i);
  });

  it("says nothing about a pair it cannot compare", () => {
    // "Please add both dates" already owns the empty case; this rule only
    // speaks when there are two real dates to weigh against each other.
    expect(validatePurchaseDates("", "", TODAY).ok).toBe(true);
    expect(validatePurchaseDates("2026-07-06", "", TODAY).ok).toBe(true);
    expect(validatePurchaseDates("", "2026-07-06", TODAY).ok).toBe(true);
    expect(validatePurchaseDates("not-a-date", "2026-07-06", TODAY).ok).toBe(true);
  });

  it("never speaks in alarm language", () => {
    const bad = [
      validatePurchaseDates("2026-08-01", "2026-08-30", TODAY),
      validatePurchaseDates("2026-08-04", "2026-07-29", TODAY),
    ];
    for (const check of bad) {
      expect(check.ok).toBe(false);
      if (!check.ok) {
        expect(check.error).not.toMatch(/invalid|error|required|must|cannot/i);
        expect(check.error).not.toContain("!");
      }
    }
  });
});

describe("the grace belongs to the server, not the browser", () => {
  // The reviews converged on this: with the grace applied client-side, where
  // the reference IS the customer's own clock, a delivery of exactly tomorrow
  // passed. journeyDay then returned -1, dayCountState read it as "early", and
  // the screen announced "night -1" over the before-night-31 choice — a smaller
  // version of what Emy was shown, and exactly what R-3 exists to stop.
  it("tolerates tomorrow when the reference is a server clock", () => {
    expect(validatePurchaseDates("2026-08-01", "2026-08-21", TODAY).ok).toBe(true);
  });

  it("refuses tomorrow when the reference is the customer's own clock", () => {
    const check = validatePurchaseDates("2026-08-01", "2026-08-21", TODAY, NO_GRACE);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.field).toBe("delivery");
  });

  it("still accepts today with no grace at all", () => {
    expect(validatePurchaseDates("2026-08-01", TODAY, TODAY, NO_GRACE).ok).toBe(true);
  });

  it("names the field its message is about, so the input can be marked", () => {
    const future = validatePurchaseDates("2026-08-01", "2026-08-30", TODAY);
    const backwards = validatePurchaseDates("2026-08-04", "2026-07-29", TODAY);
    if (!future.ok) expect(future.field).toBe("delivery");
    if (!backwards.ok) expect(backwards.field).toBe("purchase");
  });
});

describe("dates that are well-formed but not real", () => {
  // Date.UTC rolls over silently, so without a round trip "2026-02-30" would be
  // weighed as March 2: a purchase of 2026-02-30 against a delivery of
  // 2026-03-01 reads as ordered and would have been refused.
  it("refuses to parse a day that does not exist", () => {
    expect(plainCalendarDate("2026-02-30")).toBeNull();
    expect(plainCalendarDate("2026-13-45")).toBeNull();
    expect(plainCalendarDate("2026-00-00")).toBeNull();
  });

  it("refuses a year JavaScript would quietly move to the 1900s", () => {
    expect(plainCalendarDate("0099-01-01")).toBeNull();
    expect(plainCalendarDate("0026-08-01")).toBeNull();
  });

  it("keeps the real ones, leap day included", () => {
    expect(plainCalendarDate("2028-02-29")).toBe("2028-02-29");
    expect(plainCalendarDate("2026-02-28")).toBe("2026-02-28");
    expect(plainCalendarDate(" 2026-07-06 ")).toBe("2026-07-06");
  });

  it("stays silent on a pair it cannot parse, rather than guessing", () => {
    expect(validatePurchaseDates("2026-02-30", "2026-03-01", TODAY).ok).toBe(true);
    expect(validatePurchaseDates("2026-03-01", "2026-13-45", TODAY).ok).toBe(true);
  });
});

describe("calendar edges the arithmetic must survive", () => {
  it("crosses a leap day", () => {
    expect(validatePurchaseDates("2028-02-28", "2028-02-29", "2028-03-05").ok).toBe(true);
    expect(validatePurchaseDates("2028-03-01", "2028-02-29", "2028-03-05").ok).toBe(false);
  });

  it("crosses a year boundary", () => {
    expect(validatePurchaseDates("2025-12-31", "2026-01-01", TODAY).ok).toBe(true);
    expect(validatePurchaseDates("2026-01-01", "2025-12-31", TODAY).ok).toBe(false);
  });

  it("crosses a month end", () => {
    expect(validatePurchaseDates("2026-07-31", "2026-08-01", TODAY).ok).toBe(true);
    expect(validatePurchaseDates("2026-08-01", "2026-07-31", TODAY).ok).toBe(false);
  });

  it("spans decades without complaint", () => {
    expect(validatePurchaseDates("1975-03-04", "1990-06-01", TODAY).ok).toBe(true);
  });
});
