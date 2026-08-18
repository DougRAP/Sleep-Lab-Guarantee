// lib/data/requests-repository.test.ts
// The consumer's own request list, and the isolation rule behind /requests/[id],
// against the in-memory repository — the backend the app actually runs on today.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { SEED_GUARANTEES } from "./seed";
import type { Claim } from "../types";

const DEMO = SEED_GUARANTEES.find((g) => g.id === "seed-guarantee-demo")!;
const RIVERA = SEED_GUARANTEES.find((g) => g.id === "seed-guarantee-rivera")!;

/** Timestamps drive the ordering, so the clock is pinned rather than raced. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-19T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * EXACTLY the guard `/requests/[id]` applies. The URL id is never trusted on its
 * own: the claim must belong to the guarantee the session re-established. Kept
 * here so the rule is tested at the seam, not only in a page.
 */
async function claimForGuarantee(
  repo: MemoryRepository,
  claimId: string,
  guaranteeId: string
): Promise<Claim | null> {
  const claim = await repo.getClaimById(claimId);
  if (!claim || claim.guaranteeId !== guaranteeId) return null;
  return claim;
}

describe("listClaimsForGuarantee", () => {
  it("is empty until the customer starts a fitting", async () => {
    const r = new MemoryRepository();
    expect(await r.listClaimsForGuarantee(DEMO.id)).toEqual([]);
  });

  it("includes the in-progress draft — it is theirs to come back to", async () => {
    const r = new MemoryRepository();
    const draft = await r.createDraftClaim({ guaranteeId: DEMO.id, preVerified: false });

    const claims = await r.listClaimsForGuarantee(DEMO.id);
    expect(claims).toHaveLength(1);
    expect(claims[0].id).toBe(draft.id);
    expect(claims[0].status).toBe("draft");
  });

  it("returns newest first", async () => {
    const r = new MemoryRepository();
    const older = await r.createDraftClaim({ guaranteeId: DEMO.id, preVerified: false });
    await r.submitClaim(older.id);

    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
    const newer = await r.createDraftClaim({ guaranteeId: DEMO.id, preVerified: false });

    const claims = await r.listClaimsForGuarantee(DEMO.id);
    expect(claims.map((c) => c.id)).toEqual([newer.id, older.id]);
  });

  it("returns only that guarantee's claims", async () => {
    const r = new MemoryRepository();
    const mine = await r.createDraftClaim({ guaranteeId: DEMO.id, preVerified: false });
    const theirs = await r.createDraftClaim({ guaranteeId: RIVERA.id, preVerified: false });

    const mineList = await r.listClaimsForGuarantee(DEMO.id);
    expect(mineList.map((c) => c.id)).toEqual([mine.id]);
    expect(mineList.map((c) => c.id)).not.toContain(theirs.id);

    const theirList = await r.listClaimsForGuarantee(RIVERA.id);
    expect(theirList.map((c) => c.id)).toEqual([theirs.id]);
  });

  it("is empty for a guarantee that does not exist", async () => {
    const r = new MemoryRepository();
    await r.createDraftClaim({ guaranteeId: DEMO.id, preVerified: false });
    expect(await r.listClaimsForGuarantee("no-such-guarantee")).toEqual([]);
  });

  it("does not hand out the stored row (no mutation leak)", async () => {
    const r = new MemoryRepository();
    const draft = await r.createDraftClaim({ guaranteeId: DEMO.id, preVerified: false });

    const [claim] = await r.listClaimsForGuarantee(DEMO.id);
    claim.reasonExperience = "tampered";

    expect((await r.getClaimById(draft.id))?.reasonExperience).toBeNull();
  });
});

describe("cross-guarantee isolation — the /requests/[id] rule", () => {
  it("resolves a claim for the guarantee that owns it", async () => {
    const r = new MemoryRepository();
    const mine = await r.createDraftClaim({ guaranteeId: DEMO.id, preVerified: false });
    await r.submitClaim(mine.id);

    expect((await claimForGuarantee(r, mine.id, DEMO.id))?.id).toBe(mine.id);
  });

  it("refuses a claim id belonging to another guarantee", async () => {
    const r = new MemoryRepository();
    const theirs = await r.createDraftClaim({ guaranteeId: RIVERA.id, preVerified: false });
    await r.submitClaim(theirs.id);

    // Guarantee A naming guarantee B's claim id in the URL.
    expect(await claimForGuarantee(r, theirs.id, DEMO.id)).toBeNull();
  });

  it("makes someone else's claim indistinguishable from one that doesn't exist", async () => {
    const r = new MemoryRepository();
    const theirs = await r.createDraftClaim({ guaranteeId: RIVERA.id, preVerified: false });
    await r.submitClaim(theirs.id);

    const someoneElses = await claimForGuarantee(r, theirs.id, DEMO.id);
    const imaginary = await claimForGuarantee(r, "claim-does-not-exist", DEMO.id);

    // Same answer either way — nothing confirms the id is real.
    expect(someoneElses).toEqual(imaginary);
    expect(someoneElses).toBeNull();
  });

  // v3: the claim number replaced the tracking number as the customer reference.
  it("does not leak another guarantee's claim number through the list either", async () => {
    const r = new MemoryRepository();
    const theirs = await r.createDraftClaim({ guaranteeId: RIVERA.id, preVerified: false });
    const { claimNumber } = await r.submitClaim(theirs.id);

    const mine = await r.listClaimsForGuarantee(DEMO.id);
    expect(mine.map((c) => c.claimNumber)).not.toContain(claimNumber);
  });
});
