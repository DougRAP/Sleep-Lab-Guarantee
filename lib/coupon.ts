// lib/coupon.ts
// The shop coupon — pure code generation + expiry math, injectable randomness so
// it is deterministic under test (same shape as lib/ra.ts).
//
// PRD #6: generated locally ON CUSTOMER REQUEST — a unique code with a four-week
// expiry, never a static always-on code. The code gets read aloud at a dealer's
// counter, so it draws from the same spoken-safe alphabet as the RA and tracking
// numbers (no I/O/U/0/1), and its own prefix keeps it distinct from both.

import type { Coupon } from "./types";
import { CODE_ALPHABET, code, type RandomSource } from "./ra";

/** Distinct from RA- and RAP- so a code never reads as the wrong document. */
export const COUPON_PREFIX = "SLP";

/** Four weeks. The whole point of the code is that it expires. */
export const COUPON_VALID_DAYS = 28;

const COUPON_CODE_LENGTH = 6;

const COUPON_RE = new RegExp(
  `^${COUPON_PREFIX}-[${CODE_ALPHABET}]{${COUPON_CODE_LENGTH}}$`
);

/** Coupon code: `SLP-K7QM4X`. */
export function generateCouponCode(random: RandomSource = Math.random): string {
  return `${COUPON_PREFIX}-${code(COUPON_CODE_LENGTH, random)}`;
}

export function isCouponCode(value: string): boolean {
  return COUPON_RE.test(value);
}

/** Four weeks from issue, as an ISO timestamp. */
export function couponExpiresAt(issuedAt: string): string {
  const issued = new Date(issuedAt).getTime();
  return new Date(issued + COUPON_VALID_DAYS * 86_400_000).toISOString();
}

/**
 * Expired only once `now` is PAST the expiry instant — a coupon is still good on
 * its last day. Day 28 valid, day 29 expired.
 */
export function isCouponExpired(
  coupon: Pick<Coupon, "expiresAt">,
  now: Date = new Date()
): boolean {
  return now.getTime() > new Date(coupon.expiresAt).getTime();
}
