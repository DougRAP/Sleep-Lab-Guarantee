// lib/rate-limit.test.ts
// B-13 Pieza 1: rate limiting. The windowing math is pure and tested here; the
// atomic counter lives in the repository. enforceRateLimit is FAIL-OPEN: if the
// counter store throws, the request is allowed (a limiter outage must never
// take down the front door).

import { describe, it, expect, vi } from "vitest";
import { windowStart, enforceRateLimit } from "./rate-limit";

describe("windowStart", () => {
  it("floors a timestamp to the window boundary (UTC)", () => {
    const t = Date.parse("2026-07-24T17:23:45.000Z");
    // 15-minute window → 17:15:00
    expect(windowStart(t, 900)).toBe("2026-07-24T17:15:00.000Z");
    // 1-hour window → 17:00:00
    expect(windowStart(t, 3600)).toBe("2026-07-24T17:00:00.000Z");
  });

  it("two timestamps in the same window share a boundary; the next one differs", () => {
    const a = Date.parse("2026-07-24T17:15:00.000Z");
    const b = Date.parse("2026-07-24T17:29:59.000Z");
    const c = Date.parse("2026-07-24T17:30:00.000Z");
    expect(windowStart(a, 900)).toBe(windowStart(b, 900));
    expect(windowStart(a, 900)).not.toBe(windowStart(c, 900));
  });
});

describe("enforceRateLimit", () => {
  const base = { bucket: "lookup_order", key: "1011099412A", windowSeconds: 3600, limit: 5, now: 0 };

  it("allows while at or under the limit, blocks once over", async () => {
    const bump = vi.fn().mockResolvedValue(5); // this hit is the 5th
    expect(await enforceRateLimit(bump, base)).toEqual({ allowed: true, count: 5 });

    const bump6 = vi.fn().mockResolvedValue(6); // the 6th
    expect(await enforceRateLimit(bump6, base)).toEqual({ allowed: false, count: 6 });
  });

  it("is FAIL-OPEN: a throwing counter allows the request", async () => {
    const bump = vi.fn().mockRejectedValue(new Error("db down"));
    const res = await enforceRateLimit(bump, base);
    expect(res.allowed).toBe(true);
    expect(res.failOpen).toBe(true);
  });

  it("passes the floored window boundary to the counter", async () => {
    const bump = vi.fn().mockResolvedValue(1);
    await enforceRateLimit(bump, {
      ...base,
      windowSeconds: 900,
      now: Date.parse("2026-07-24T17:23:45.000Z"),
    });
    expect(bump).toHaveBeenCalledWith("lookup_order", "1011099412A", "2026-07-24T17:15:00.000Z");
  });
});
