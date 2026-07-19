import { describe, it, expect } from "vitest";
import { selectTip, timeOfDayFor } from "./tips";
import { SEED_TIPS } from "./data/seed";

describe("selectTip", () => {
  it("returns null when nothing matches the day/phase", () => {
    expect(selectTip(SEED_TIPS, { day: 200, phase: "expired" })).toBeNull();
  });

  it("picks the morning settling-in tip around week two", () => {
    const tip = selectTip(SEED_TIPS, { day: 12, phase: "settle_in", timeOfDay: "morning" });
    expect(tip?.id).toBe("seed-tip-3"); // "Rotate, don't judge yet"
  });

  it("picks the night settling-in tip at night", () => {
    const tip = selectTip(SEED_TIPS, { day: 12, phase: "settle_in", timeOfDay: "night" });
    expect(tip?.id).toBe("seed-tip-2"); // "Adjustment takes time"
  });

  it("falls back to a day/phase tip when no time-of-day match exists", () => {
    // Day 12 has no evening tip — still surfaces a settling-in tip rather than null.
    const tip = selectTip(SEED_TIPS, { day: 12, phase: "settle_in", timeOfDay: "evening" });
    expect(tip?.id).toBe("seed-tip-3");
  });

  it("surfaces the safety-net tip once the exchange window opens", () => {
    const tip = selectTip(SEED_TIPS, { day: 45, phase: "safety_net", timeOfDay: "evening" });
    expect(tip?.id).toBe("seed-tip-5"); // "The comfort exchange is open"
  });

  it("respects the active flag", () => {
    const inactive = SEED_TIPS.map((t) => ({ ...t, active: false }));
    expect(selectTip(inactive, { day: 12, phase: "settle_in" })).toBeNull();
  });
});

describe("timeOfDayFor", () => {
  it("buckets clock hours into time-of-day", () => {
    expect(timeOfDayFor(new Date(2026, 0, 1, 8))).toBe("morning");
    expect(timeOfDayFor(new Date(2026, 0, 1, 14))).toBe("day");
    expect(timeOfDayFor(new Date(2026, 0, 1, 19))).toBe("evening");
    expect(timeOfDayFor(new Date(2026, 0, 1, 23))).toBe("night");
    expect(timeOfDayFor(new Date(2026, 0, 1, 2))).toBe("night");
  });
});
