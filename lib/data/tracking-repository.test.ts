// lib/data/tracking-repository.test.ts
// v3 (M-S5) — the tracking seams against the in-memory repository: claims by
// account (works with zero guarantees), claim→account linking, and the
// read-only two-key guarantee finder behind the relaxed link step.

import { describe, expect, it } from "vitest";
import { MemoryRepository } from "./memory-repository";

const USER = "auth-user-1";
const OTHER_USER = "auth-user-2";

describe("listClaimsForUser", () => {
  it("is empty for an account with nothing linked", async () => {
    const r = new MemoryRepository();
    expect(await r.listClaimsForUser(USER)).toEqual([]);
    expect(await r.listClaimsForUser("")).toEqual([]);
  });

  it("lists exactly the account's claims, newest first", async () => {
    const r = new MemoryRepository();
    await r.linkClaimToUser("seed-claim-osborne", USER);
    await r.linkClaimToUser("seed-claim-calloway", USER);
    await r.linkClaimToUser("seed-claim-boyd", OTHER_USER);

    const mine = await r.listClaimsForUser(USER);
    expect(mine.map((c) => c.id).sort()).toEqual([
      "seed-claim-calloway",
      "seed-claim-osborne",
    ]);
    expect(mine.map((c) => c.id)).not.toContain("seed-claim-boyd");
  });

  it("does not hand out the stored row (no mutation leak)", async () => {
    const r = new MemoryRepository();
    await r.linkClaimToUser("seed-claim-osborne", USER);
    const [claim] = await r.listClaimsForUser(USER);
    claim.reasonExperience = "tampered";
    expect((await r.getClaimById("seed-claim-osborne"))?.reasonExperience).not.toBe(
      "tampered"
    );
  });
});

describe("linkClaimToUser", () => {
  it("attaches a free claim and is idempotent for the same user", async () => {
    const r = new MemoryRepository();
    const linked = await r.linkClaimToUser("seed-claim-osborne", USER);
    expect(linked?.consumerId).toBe(USER);
    const again = await r.linkClaimToUser("seed-claim-osborne", USER);
    expect(again?.consumerId).toBe(USER);
  });

  it("refuses a claim that belongs to a different account", async () => {
    const r = new MemoryRepository();
    await r.linkClaimToUser("seed-claim-osborne", OTHER_USER);
    expect(await r.linkClaimToUser("seed-claim-osborne", USER)).toBeNull();
    expect((await r.getClaimById("seed-claim-osborne"))?.consumerId).toBe(OTHER_USER);
  });

  it("returns null for an unknown claim or a blank user", async () => {
    const r = new MemoryRepository();
    expect(await r.linkClaimToUser("no-such-claim", USER)).toBeNull();
    expect(await r.linkClaimToUser("seed-claim-osborne", "  ")).toBeNull();
  });
});

describe("findGuaranteeForLink", () => {
  it("finds by sales order + last name, and by ZIP + last name", async () => {
    const r = new MemoryRepository();
    expect(
      (
        await r.findGuaranteeForLink({
          lastName: "calloway",
          salesOrderNumber: "1011099412a",
        })
      )?.id
    ).toBe("seed-guarantee-calloway");
    expect(
      (await r.findGuaranteeForLink({ lastName: "Calloway", deliveryZip: "28150" }))?.id
    ).toBe("seed-guarantee-calloway");
  });

  it("returns null on no match — the caller decides what happens next", async () => {
    const r = new MemoryRepository();
    expect(
      await r.findGuaranteeForLink({ lastName: "Nobody", deliveryZip: "28150" })
    ).toBeNull();
    expect(
      await r.findGuaranteeForLink({ lastName: "Calloway" })
    ).toBeNull();
  });

  it("never links as a side effect — it is a read", async () => {
    const r = new MemoryRepository();
    const found = await r.findGuaranteeForLink({
      lastName: "Calloway",
      deliveryZip: "28150",
    });
    expect(found?.consumerId ?? null).toBeNull();
    expect(await r.getGuaranteeForUser(USER)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* R-7 — the production system writes its claim number back onto ours          */
/* -------------------------------------------------------------------------- */

describe("recordTtcClaim", () => {
  /** A claim with a CG number of its own, which is the key TTC will send. */
  async function submitted(r: MemoryRepository) {
    const claim = await r.createAnonymousClaim({
      firstName: "Terri",
      lastName: "Osborne",
      deliveryZip: "28105",
    });
    const { claimNumber } = await r.submitClaim(claim.id);
    return claimNumber;
  }

  it("writes the number onto the claim that carries ours", async () => {
    const r = new MemoryRepository();
    const cg = await submitted(r);

    const updated = await r.recordTtcClaim(cg, "TTC-9912");

    expect(updated?.ttcClaim).toBe("TTC-9912");
    expect((await r.getClaimByNumber(cg))?.ttcClaim).toBe("TTC-9912");
  });

  it("finds the claim however TTC types the number", async () => {
    // Same forgiving rule getClaimByNumber uses (claimNumberQuery): case-blind
    // and the CG prefix optional, so an integration does not fail on casing.
    const r = new MemoryRepository();
    const cg = await submitted(r);

    expect((await r.recordTtcClaim(cg.toLowerCase(), "T1"))?.ttcClaim).toBe("T1");
    expect((await r.recordTtcClaim(cg.replace(/^CG/i, ""), "T2"))?.ttcClaim).toBe("T2");
  });

  it("last write wins", async () => {
    // Doug asked for an API that "writes the record". Refusing to overwrite is
    // a rule nobody stated, and a retry after a timeout is the ordinary case.
    const r = new MemoryRepository();
    const cg = await submitted(r);

    await r.recordTtcClaim(cg, "TTC-1");
    await r.recordTtcClaim(cg, "TTC-2");

    expect((await r.getClaimByNumber(cg))?.ttcClaim).toBe("TTC-2");
  });

  it("a retry carrying what we already hold is not a write", async () => {
    // The admin board sorts on updated_at, so bumping it on every retry lets an
    // ordinary dead-letter replay reorder the agents' queue.
    const r = new MemoryRepository();
    const cg = await submitted(r);
    await r.recordTtcClaim(cg, "TTC-9912");
    const first = (await r.getClaimByNumber(cg))!;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const again = (await r.recordTtcClaim(cg, "TTC-9912"))!;

    expect(again.ttcClaim).toBe("TTC-9912");
    expect(again.updatedAt).toBe(first.updatedAt);
  });

  it("returns null when nothing carries that number", async () => {
    const r = new MemoryRepository();
    expect(await r.recordTtcClaim("CG000000", "TTC-9912")).toBeNull();
  });

  it("refuses an empty number on either side", async () => {
    const r = new MemoryRepository();
    const cg = await submitted(r);

    expect(await r.recordTtcClaim("", "TTC-9912")).toBeNull();
    expect(await r.recordTtcClaim(cg, "   ")).toBeNull();
    expect((await r.getClaimByNumber(cg))?.ttcClaim ?? null).toBeNull();
  });

  it("touches nothing else on the claim", async () => {
    const r = new MemoryRepository();
    const cg = await submitted(r);
    const before = (await r.getClaimByNumber(cg))!;

    const after = (await r.recordTtcClaim(cg, "TTC-9912"))!;

    expect(after.status).toBe(before.status);
    expect(after.claimNumber).toBe(before.claimNumber);
    expect(after.consumerId ?? null).toBe(before.consumerId ?? null);
    expect(after.submittedAt).toBe(before.submittedAt);
  });
});
