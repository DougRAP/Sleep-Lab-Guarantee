// lib/coupon.test.ts
// The coupon code gets read aloud at a dealer's counter and it expires — the
// format, the distinctness from RA/tracking numbers, and the four-week boundary
// are all part of the contract.

import { describe, expect, it } from "vitest";
import {
  COUPON_PREFIX,
  COUPON_VALID_DAYS,
  couponExpiresAt,
  generateCouponCode,
  isCouponExpired,
  isCouponCode,
} from "./coupon";
import { generateRaNumber, generateTrackingNumber, isRaNumber, isTrackingNumber } from "./ra";

/** Deterministic "random" walking the alphabet. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const DAY_MS = 86_400_000;

describe("generateCouponCode", () => {
  it("is a six-character SLP code", () => {
    expect(generateCouponCode(sequence([0]))).toBe("SLP-222222");
  });

  it("always matches the coupon format", () => {
    for (let i = 0; i < 200; i++) {
      expect(isCouponCode(generateCouponCode())).toBe(true);
    }
  });

  it("excludes glyphs that get confused when read aloud (I, O, U, 0, 1)", () => {
    const codes = Array.from({ length: 300 }, () => generateCouponCode());
    for (const c of codes) {
      expect(c.replace(`${COUPON_PREFIX}-`, "")).not.toMatch(/[IOU01]/);
    }
  });

  it("is unique enough to hand out", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateCouponCode()));
    expect(seen.size).toBeGreaterThan(480);
  });

  it("never collides with an RA or tracking number", () => {
    const coupon = generateCouponCode();
    expect(isRaNumber(coupon)).toBe(false);
    expect(isTrackingNumber(coupon)).toBe(false);
    expect(isCouponCode(generateRaNumber())).toBe(false);
    expect(isCouponCode(generateTrackingNumber())).toBe(false);
    // "SLP-" is its own prefix, not a suffix of "RAP-".
    expect(coupon.startsWith("RAP-")).toBe(false);
    expect(coupon.startsWith("RA-")).toBe(false);
  });
});

describe("couponExpiresAt", () => {
  it("is four weeks out", () => {
    expect(COUPON_VALID_DAYS).toBe(28);
    const issuedAt = "2026-07-19T12:00:00.000Z";
    expect(couponExpiresAt(issuedAt)).toBe("2026-08-16T12:00:00.000Z");
  });

  it("is exactly COUPON_VALID_DAYS later, to the millisecond", () => {
    const issuedAt = new Date().toISOString();
    const delta =
      new Date(couponExpiresAt(issuedAt)).getTime() - new Date(issuedAt).getTime();
    expect(delta).toBe(COUPON_VALID_DAYS * DAY_MS);
  });
});

describe("isCouponExpired", () => {
  const issuedAt = "2026-07-19T12:00:00.000Z";
  const coupon = { expiresAt: couponExpiresAt(issuedAt) };
  const at = (days: number) => new Date(new Date(issuedAt).getTime() + days * DAY_MS);

  it("is good on the day it is issued", () => {
    expect(isCouponExpired(coupon, at(0))).toBe(false);
  });

  it("is still good on day 28 — the boundary is inclusive", () => {
    expect(isCouponExpired(coupon, at(28))).toBe(false);
  });

  it("has expired by day 29", () => {
    expect(isCouponExpired(coupon, at(29))).toBe(true);
  });

  it("expires the instant after its expiry, not before", () => {
    const expiry = new Date(coupon.expiresAt).getTime();
    expect(isCouponExpired(coupon, new Date(expiry - 1))).toBe(false);
    expect(isCouponExpired(coupon, new Date(expiry))).toBe(false);
    expect(isCouponExpired(coupon, new Date(expiry + 1))).toBe(true);
  });
});
