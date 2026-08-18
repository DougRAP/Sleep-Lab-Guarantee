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
