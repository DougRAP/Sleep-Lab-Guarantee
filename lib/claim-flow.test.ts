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
  isBackwardStage,
  previousStage,
  stageForStep,
  stepForStage,
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
