// lib/coach-cost.test.ts
// B-11: dollars are an ESTIMATE at Haiku list prices — the official number
// lives in the Anthropic Console. These tests pin the arithmetic, not the
// prices themselves (those are dated constants).

import { describe, it, expect } from "vitest";
import { HAIKU_PRICES_PER_MTOK, estimateCostUsd, formatUsd } from "./coach-cost";

describe("estimateCostUsd", () => {
  it("prices each token class at its own rate, per million", () => {
    const usd = estimateCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    expect(usd).toBeCloseTo(
      HAIKU_PRICES_PER_MTOK.input + HAIKU_PRICES_PER_MTOK.output,
      10
    );
  });

  it("cache tokens are billed at their own (cheaper/dearer) rates", () => {
    const usd = estimateCostUsd({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 2_000_000,
      cacheReadTokens: 10_000_000,
    });
    expect(usd).toBeCloseTo(
      2 * HAIKU_PRICES_PER_MTOK.cacheWrite + 10 * HAIKU_PRICES_PER_MTOK.cacheRead,
      10
    );
  });

  it("a typical chat reply costs a fraction of a cent", () => {
    // ~600 in / ~120 out, the shape of a real coach exchange.
    const usd = estimateCostUsd({
      inputTokens: 600,
      outputTokens: 120,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    expect(usd).toBeGreaterThan(0);
    expect(usd).toBeLessThan(0.01);
  });

  it("zero usage costs zero", () => {
    expect(
      estimateCostUsd({
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      })
    ).toBe(0);
  });
});

describe("formatUsd", () => {
  it("shows tiny amounts without collapsing to $0.00", () => {
    expect(formatUsd(0.0012)).toBe("$0.0012");
  });
  it("shows normal amounts with two decimals", () => {
    expect(formatUsd(12.3456)).toBe("$12.35");
  });
  it("zero is a plain $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });
});
