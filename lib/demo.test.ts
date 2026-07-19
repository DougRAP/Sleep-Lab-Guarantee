// lib/demo.test.ts
// The demo day-jumper. The contract that matters: the chosen day must feed the
// real eligibility engine, so previewing day 30 / 31 / 91 gives exactly the
// answers real time would on those days — and none of it touches a record.

import { describe, expect, it } from "vitest";
import {
  DEMO_DAY_MAX,
  DEMO_DAY_PRESETS,
  isDemoMode,
  parseDemoDay,
  referenceDateForDay,
  resolveReferenceDate,
} from "./demo";
import { evaluateEligibility, journeyDay } from "./eligibility";

const DELIVERY = "2026-01-10";

describe("isDemoMode", () => {
  it("defaults on when the env is unset (production is the demo right now)", () => {
    expect(isDemoMode(undefined)).toBe(true);
    expect(isDemoMode("")).toBe(true);
  });

  it("is on only for 'true' once the env is set", () => {
    expect(isDemoMode("true")).toBe(true);
    expect(isDemoMode("TRUE")).toBe(true);
    expect(isDemoMode("false")).toBe(false);
    expect(isDemoMode("0")).toBe(false);
    expect(isDemoMode("off")).toBe(false);
  });
});

describe("parseDemoDay", () => {
  it("accepts every preset", () => {
    for (const preset of DEMO_DAY_PRESETS) {
      expect(parseDemoDay(preset)).toBe(preset);
    }
  });

  it("accepts free entry as a string", () => {
    expect(parseDemoDay("45")).toBe(45);
    expect(parseDemoDay(" 45 ")).toBe(45);
  });

  it("rejects anything unusable rather than guessing", () => {
    expect(parseDemoDay(null)).toBeNull();
    expect(parseDemoDay("")).toBeNull();
    expect(parseDemoDay("soon")).toBeNull();
    expect(parseDemoDay(-1)).toBeNull();
    expect(parseDemoDay(DEMO_DAY_MAX + 1)).toBeNull();
  });
});

describe("referenceDateForDay", () => {
  it("produces a reference date the engine reads back as that exact day", () => {
    for (const day of [0, 12, 30, 31, 60, 90, 91]) {
      const ref = referenceDateForDay(DELIVERY, day);
      expect(journeyDay(DELIVERY, ref)).toBe(day);
    }
  });

  it("crosses a month boundary correctly", () => {
    expect(journeyDay("2026-01-31", referenceDateForDay("2026-01-31", 31))).toBe(31);
  });
});

describe("resolveReferenceDate", () => {
  it("follows real time when no day is chosen", () => {
    const now = new Date(2026, 5, 1);
    expect(resolveReferenceDate(DELIVERY, null, now)).toBe(now);
  });

  it("overrides real time when a day is chosen", () => {
    const now = new Date(2026, 5, 1);
    const ref = resolveReferenceDate(DELIVERY, 31, now);
    expect(ref).not.toBe(now);
    expect(journeyDay(DELIVERY, ref)).toBe(31);
  });
});

describe("the effective day feeds eligibility", () => {
  function eligibilityAtPreviewDay(day: number) {
    return evaluateEligibility({
      deliveryDate: DELIVERY,
      referenceDate: resolveReferenceDate(DELIVERY, day),
    });
  }

  it("day 30 — still settling in, the exchange is not offered", () => {
    const elig = eligibilityAtPreviewDay(30);
    expect(elig.day).toBe(30);
    expect(elig.eligible).toBe(false);
    expect(elig.phase).toBe("settle_in");
    expect(elig.reasons[0]?.ruleId).toBe("adjustment_period");
  });

  it("day 31 — the window opens, the fitting is reachable", () => {
    const elig = eligibilityAtPreviewDay(31);
    expect(elig.day).toBe(31);
    expect(elig.eligible).toBe(true);
    expect(elig.phase).toBe("safety_net");
    expect(elig.reasons[0]?.ruleId).toBe("window_open");
  });

  it("day 90 — the last eligible night", () => {
    expect(eligibilityAtPreviewDay(90).eligible).toBe(true);
  });

  it("day 91 — the window has closed", () => {
    const elig = eligibilityAtPreviewDay(91);
    expect(elig.day).toBe(91);
    expect(elig.eligible).toBe(false);
    expect(elig.phase).toBe("expired");
    expect(elig.reasons[0]?.ruleId).toBe("window_closed");
  });

  it("every preset resolves to the day it advertises", () => {
    for (const preset of DEMO_DAY_PRESETS) {
      expect(eligibilityAtPreviewDay(preset).day).toBe(preset);
    }
  });
});
