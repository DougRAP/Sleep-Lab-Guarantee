// lib/data/claim-status-repository.test.ts
// The adjudication seam: updateClaimStatus against the in-memory repository —
// the backend the app actually runs on today. The guard rules are shared with
// the Supabase backend via assertClaimStatusTransition (lib/data/repository.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { SEED_GUARANTEES } from "./seed";
import type { Claim } from "../types";

const DEMO = SEED_GUARANTEES.find((g) => g.id === "seed-guarantee-demo")!;

/** Timestamps drive the updatedAt assertions, so the clock is pinned. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-19T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

/** A freshly submitted request — the state adjudication starts from. */
async function submittedClaim(r: MemoryRepository): Promise<Claim> {
  const draft = await r.createDraftClaim({ guaranteeId: DEMO.id, preVerified: false });
  const { claim } = await r.submitClaim(draft.id);
  return claim;
}

describe("updateClaimStatus", () => {
  it("moves a submitted claim forward and refreshes updatedAt", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);

    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
    const updated = await r.updateClaimStatus(claim.id, "in_review");

    expect(updated.status).toBe("in_review");
    expect(updated.updatedAt).toBe("2026-07-20T12:00:00.000Z");
    // Persisted, not just returned.
    expect((await r.getClaimById(claim.id))?.status).toBe("in_review");
  });

  it("walks the whole happy path through to completed", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);

    for (const status of [
      "in_review",
      "approved",
      "dealer_scheduled",
      "completed",
    ] as const) {
      expect((await r.updateClaimStatus(claim.id, status)).status).toBe(status);
    }
  });

  it.each(["completed", "denied", "expired", "withdrawn"] as const)(
    "lets adjudication reopen a %s claim — an accommodation is always possible (review 2026-07-22)",
    async (terminal) => {
      const r = new MemoryRepository();
      const claim = await submittedClaim(r);
      await r.updateClaimStatus(claim.id, terminal);

      const reopened = await r.updateClaimStatus(claim.id, "in_review");
      expect(reopened.status).toBe("in_review");
      expect((await r.getClaimById(claim.id))?.status).toBe("in_review");
    }
  );

  it("still never sends a terminal claim back to draft", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);
    await r.updateClaimStatus(claim.id, "denied");
    await expect(r.updateClaimStatus(claim.id, "draft")).rejects.toThrow(
      "Cannot move a claim back to draft"
    );
  });

  it("refuses to send any claim back to draft", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);

    await expect(r.updateClaimStatus(claim.id, "draft")).rejects.toThrow(
      "Cannot move a claim back to draft"
    );
    expect((await r.getClaimById(claim.id))?.status).toBe("submitted");
  });

  it("throws for an unknown claim id", async () => {
    const r = new MemoryRepository();
    await expect(r.updateClaimStatus("no-such-claim", "in_review")).rejects.toThrow(
      "No claim no-such-claim"
    );
  });
});
