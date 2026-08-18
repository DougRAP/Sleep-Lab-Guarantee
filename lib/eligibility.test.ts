import { describe, it, expect } from "vitest";
import {
  journeyDay,
  journeyPhase,
  evaluateEligibility,
  WINDOW_OPEN_DAY,
  WINDOW_CLOSE_DAY,
  COMFORT_EXCHANGE_FEE,
  RULES,
} from "./eligibility";
import { GUARANTEE_ESSENTIALS, GUARANTEE_TERMS } from "../content/guarantee-terms";

// The signed guarantee (2026-07, confirmed by Doug in the 07-22 review:
// "the document is right") sets a $199 comfort exchange fee; the separate
// restocking fee applies only to California King sets.
// B-29 (Doug, 2026-07-27): the "one request per sales order" block is gone.
// Doug: "the app should not restrict the number of times any sales order is used
// by the same customer." A prior submitted/denied request no longer walls off a
// new one — duplicates are caught dealer-side at approval. The ONLY hard stop is
// a COMPLETED/approved exchange, which the signed guarantee caps at one per set
// ("ONLY ONE exchange under this Guarantee"), keyed by guarantee.
describe("re-filing a request (B-29, Doug 2026-07-27)", () => {
  it("a prior submitted/denied request no longer blocks starting another", () => {
    const r = evaluateEligibility({
      deliveryDate: deliveryNDaysAgo(40),
      referenceDate: REF,
    });
    expect(r.eligible).toBe(true);
    // The retired rule is gone from the catalog entirely.
    expect(RULES).not.toHaveProperty("ONE_REQUEST_PER_ORDER");
  });

  it("a resolved exchange still blocks — the one-time rule (terms)", () => {
    const r = evaluateEligibility({
      deliveryDate: deliveryNDaysAgo(40),
      referenceDate: REF,
      exchangeResolved: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.reasons.map((x) => x.ruleId)).toContain(RULES.ONE_TIME_ONLY.id);
  });

  it("the window rules behave exactly as before", () => {
    expect(evaluateEligibility({ deliveryDate: deliveryNDaysAgo(40), referenceDate: REF }).eligible).toBe(true);
    expect(evaluateEligibility({ deliveryDate: deliveryNDaysAgo(10), referenceDate: REF }).eligible).toBe(false);
    expect(evaluateEligibility({ deliveryDate: deliveryNDaysAgo(120), referenceDate: REF }).eligible).toBe(false);
  });
});

describe("comfort exchange fee (signed guarantee 2026-07)", () => {
  it("is $199", () => {
    expect(COMFORT_EXCHANGE_FEE).toBe(199);
  });

  it("is cited as a comfort exchange fee, not a restocking fee", () => {
    expect(RULES.COMFORT_EXCHANGE_FEE.message).toContain("$199 comfort exchange fee");
  });

  it("appears in the in-app essentials with the correct amount", () => {
    const feeLine = GUARANTEE_ESSENTIALS.find((l) => l.includes("comfort exchange fee"));
    expect(feeLine).toContain("$199");
    expect(GUARANTEE_ESSENTIALS.some((l) => l.includes("$99 restocking"))).toBe(false);
  });

  it("keeps the Cal King restocking fee as a separate, dealer-collected term", () => {
    const all = GUARANTEE_TERMS.flatMap((s) => [...(s.body ?? []), ...(s.items ?? [])]);
    expect(all.some((l) => l.includes("California King"))).toBe(true);
  });
});

// Fixed reference so tests are deterministic.
const REF = new Date("2026-07-19T21:00:00");

/** ISO (YYYY-MM-DD) date `n` whole days before the reference date. */
function deliveryNDaysAgo(n: number): string {
  const d = new Date(REF);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("journeyDay", () => {
  it("counts the delivery day as day 0", () => {
    expect(journeyDay(deliveryNDaysAgo(0), REF)).toBe(0);
  });

  it("counts whole days since delivery", () => {
    expect(journeyDay(deliveryNDaysAgo(12), REF)).toBe(12);
    expect(journeyDay(deliveryNDaysAgo(31), REF)).toBe(31);
    expect(journeyDay(deliveryNDaysAgo(90), REF)).toBe(90);
  });

  it("is DST-safe (uses calendar days, not elapsed hours)", () => {
    // Spans the US spring-forward boundary (Mar 8, 2026).
    expect(journeyDay("2026-03-01", new Date("2026-03-15T04:00:00"))).toBe(14);
  });
});

describe("journeyPhase", () => {
  it("settle_in through day 30", () => {
    expect(journeyPhase(0)).toBe("settle_in");
    expect(journeyPhase(30)).toBe("settle_in");
  });
  it("safety_net day 31 through 90", () => {
    expect(journeyPhase(31)).toBe("safety_net");
    expect(journeyPhase(90)).toBe("safety_net");
  });
  it("expired from day 91", () => {
    expect(journeyPhase(91)).toBe("expired");
  });
  it("resolved when an exchange already completed (overrides day)", () => {
    expect(journeyPhase(45, true)).toBe("resolved");
    expect(journeyPhase(10, true)).toBe("resolved");
  });
});

describe("evaluateEligibility — window boundaries", () => {
  it("day 30 is NOT eligible (still settling in — off-by-one fix)", () => {
    const r = evaluateEligibility({
      deliveryDate: deliveryNDaysAgo(30),
      referenceDate: REF,
    });
    expect(r.day).toBe(30);
    expect(r.eligible).toBe(false);
    expect(r.phase).toBe("settle_in");
    expect(r.reasons.map((x) => x.ruleId)).toContain(RULES.ADJUSTMENT_PERIOD.id);
  });

  it("day 31 IS eligible (floor is day 31, not 30)", () => {
    const r = evaluateEligibility({
      deliveryDate: deliveryNDaysAgo(31),
      referenceDate: REF,
    });
    expect(r.day).toBe(31);
    expect(r.eligible).toBe(true);
    expect(r.phase).toBe("safety_net");
    expect(r.reasons.map((x) => x.ruleId)).toContain(RULES.WINDOW_OPEN.id);
  });

  it("day 90 IS eligible (last day of the window)", () => {
    const r = evaluateEligibility({
      deliveryDate: deliveryNDaysAgo(90),
      referenceDate: REF,
    });
    expect(r.day).toBe(90);
    expect(r.eligible).toBe(true);
    expect(r.phase).toBe("safety_net");
  });

  it("day 91 is expired (window closed)", () => {
    const r = evaluateEligibility({
      deliveryDate: deliveryNDaysAgo(91),
      referenceDate: REF,
    });
    expect(r.day).toBe(91);
    expect(r.eligible).toBe(false);
    expect(r.phase).toBe("expired");
    expect(r.reasons.map((x) => x.ruleId)).toContain(RULES.WINDOW_CLOSED.id);
  });
});

describe("evaluateEligibility — one-time only", () => {
  it("already-exchanged is NOT eligible even inside the window", () => {
    const r = evaluateEligibility({
      deliveryDate: deliveryNDaysAgo(45),
      referenceDate: REF,
      exchangeResolved: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.phase).toBe("resolved");
    expect(r.reasons.map((x) => x.ruleId)).toContain(RULES.ONE_TIME_ONLY.id);
  });
});

describe("evaluateEligibility — shape", () => {
  it("always cites the window bounds and at least one rule", () => {
    const r = evaluateEligibility({
      deliveryDate: deliveryNDaysAgo(12),
      referenceDate: REF,
    });
    expect(r.windowOpensDay).toBe(WINDOW_OPEN_DAY);
    expect(r.windowClosesDay).toBe(WINDOW_CLOSE_DAY);
    expect(r.reasons.length).toBeGreaterThan(0);
    for (const reason of r.reasons) {
      expect(typeof reason.ruleId).toBe("string");
      expect(reason.message.length).toBeGreaterThan(0);
    }
  });
});
