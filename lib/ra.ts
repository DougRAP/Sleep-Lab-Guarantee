// lib/ra.ts
// Return Authorization (RA) + tracking number generation — pure, injectable
// randomness so it is deterministic under test.
//
// The RA is the dealer-facing document for an authorized exchange; the tracking
// number is what the customer follows in Requests. Both are readable aloud over
// the phone, so the alphabet excludes characters that get confused when spoken
// or written (I/O/0/1/U).

/**
 * Crockford-ish alphabet minus easily-confused glyphs. Exported because every
 * code this product reads aloud must draw from the same set — the shop coupon
 * (lib/coupon.ts) included.
 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTVWXYZ";

export const RA_PREFIX = "RA";
export const TRACKING_PREFIX = "RAP";

/** Source of randomness; injectable for deterministic tests. */
export type RandomSource = () => number;

export function code(length: number, random: RandomSource): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length;
    out += CODE_ALPHABET[idx];
  }
  return out;
}

/** YYMMDD in local calendar terms. */
function datePart(at: Date): string {
  const y = String(at.getFullYear() % 100).padStart(2, "0");
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * RA number: `RA-260719-K7QM`. The date segment makes a stack of RAs sortable
 * by day at a glance; the suffix keeps it unique.
 */
export function generateRaNumber(
  at: Date = new Date(),
  random: RandomSource = Math.random
): string {
  return `${RA_PREFIX}-${datePart(at)}-${code(4, random)}`;
}

/** Tracking number: `RAP-9F2K4M7X`. Customer-facing, no date leakage. */
export function generateTrackingNumber(random: RandomSource = Math.random): string {
  return `${TRACKING_PREFIX}-${code(8, random)}`;
}

const RA_RE = new RegExp(`^${RA_PREFIX}-\\d{6}-[${CODE_ALPHABET}]{4}$`);
const TRACKING_RE = new RegExp(`^${TRACKING_PREFIX}-[${CODE_ALPHABET}]{8}$`);

export function isRaNumber(value: string): boolean {
  return RA_RE.test(value);
}

export function isTrackingNumber(value: string): boolean {
  return TRACKING_RE.test(value);
}
