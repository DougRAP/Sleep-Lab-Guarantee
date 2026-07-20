// lib/data/coupon-repository.test.ts
// The shop coupon at the repository seam: issued on request, idempotent while it
// lives, and carrying a snapshot of the dealer's percentage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { SEED_GUARANTEES } from "./seed";
import { COUPON_VALID_DAYS, isCouponCode } from "../coupon";
import type { DealerLocation } from "../types";

const DEMO = SEED_GUARANTEES.find((g) => g.id === "seed-guarantee-demo")!;
const RIVERA = SEED_GUARANTEES.find((g) => g.id === "seed-guarantee-rivera")!;

const ISSUE_TIME = new Date("2026-07-19T12:00:00.000Z");
const DAY_MS = 86_400_000;

/** A dealer set this test owns, so it can change the offer mid-flight. */
function dealers(couponPct: number | null = 20): DealerLocation[] {
  return [
    {
      id: "101",
      name: "Demo Bedding Co.",
      couponCode: "SLEEPLAB20",
      couponPct,
    },
  ];
}

function repo(locations: DealerLocation[] = dealers()) {
  return new MemoryRepository(SEED_GUARANTEES, undefined, undefined, locations);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(ISSUE_TIME);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("getActiveCoupon", () => {
  it("is null until the customer asks — never an always-on code", async () => {
    const r = repo();
    expect(await r.getActiveCoupon(DEMO.id)).toBeNull();
  });

  it("returns the issued coupon", async () => {
    const r = repo();
    const issued = await r.issueCoupon(DEMO.id);
    expect((await r.getActiveCoupon(DEMO.id))?.code).toBe(issued.code);
  });

  it("is scoped per guarantee", async () => {
    const r = repo();
    await r.issueCoupon(DEMO.id);
    expect(await r.getActiveCoupon(RIVERA.id)).toBeNull();
  });
});

describe("issueCoupon", () => {
  it("issues a spoken-safe code that expires in four weeks", async () => {
    const r = repo();
    const coupon = await r.issueCoupon(DEMO.id);

    expect(isCouponCode(coupon.code)).toBe(true);
    expect(coupon.guaranteeId).toBe(DEMO.id);
    expect(coupon.issuedAt).toBe(ISSUE_TIME.toISOString());
    expect(new Date(coupon.expiresAt).getTime() - ISSUE_TIME.getTime()).toBe(
      COUPON_VALID_DAYS * DAY_MS
    );
  });

  it("copies the dealer location off the guarantee", async () => {
    const r = repo();
    expect((await r.issueCoupon(DEMO.id)).dealerLocationId).toBe("101");
  });

  it("is idempotent — asking twice returns the same code, never a second one", async () => {
    const r = repo();
    const first = await r.issueCoupon(DEMO.id);

    vi.setSystemTime(new Date(ISSUE_TIME.getTime() + 3 * DAY_MS));
    const second = await r.issueCoupon(DEMO.id);

    expect(second.id).toBe(first.id);
    expect(second.code).toBe(first.code);
    expect(second.expiresAt).toBe(first.expiresAt);
  });

  it("gives different guarantees different codes", async () => {
    const r = repo();
    const mine = await r.issueCoupon(DEMO.id);
    const theirs = await r.issueCoupon(RIVERA.id);
    expect(theirs.code).not.toBe(mine.code);
  });

  it("snapshots pct — a later dealer change can't alter a code already handed out", async () => {
    const locations = dealers(20);
    const r = repo(locations);

    const issued = await r.issueCoupon(DEMO.id);
    expect(issued.pct).toBe(20);

    // The dealer changes their offer after the customer has the code.
    locations[0].couponPct = 5;

    expect((await r.getActiveCoupon(DEMO.id))?.pct).toBe(20);
    expect((await r.issueCoupon(DEMO.id)).pct).toBe(20);
  });

  it("carries a null pct when the dealer has no percentage on file", async () => {
    const r = repo(dealers(null));
    expect((await r.issueCoupon(DEMO.id)).pct).toBeNull();
  });
});

describe("expiry", () => {
  it("is still active on day 28", async () => {
    const r = repo();
    const issued = await r.issueCoupon(DEMO.id);

    vi.setSystemTime(new Date(ISSUE_TIME.getTime() + COUPON_VALID_DAYS * DAY_MS));
    expect((await r.getActiveCoupon(DEMO.id))?.code).toBe(issued.code);
  });

  it("goes quiet once expired", async () => {
    const r = repo();
    await r.issueCoupon(DEMO.id);

    vi.setSystemTime(new Date(ISSUE_TIME.getTime() + 29 * DAY_MS));
    expect(await r.getActiveCoupon(DEMO.id)).toBeNull();
  });

  it("issues a fresh coupon once the old one has expired", async () => {
    const locations = dealers(20);
    const r = repo(locations);
    const first = await r.issueCoupon(DEMO.id);

    const later = new Date(ISSUE_TIME.getTime() + 29 * DAY_MS);
    vi.setSystemTime(later);
    locations[0].couponPct = 5;

    const second = await r.issueCoupon(DEMO.id);
    expect(second.code).not.toBe(first.code);
    expect(second.issuedAt).toBe(later.toISOString());
    // A brand-new code takes the dealer's current terms.
    expect(second.pct).toBe(5);
    expect((await r.getActiveCoupon(DEMO.id))?.code).toBe(second.code);
  });
});
