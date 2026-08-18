// lib/data/multi-purchase.test.ts
// B-28 (Doug 2026-07-27): "no limit to number of sales orders per customer."
// The data layer already lets one account own many guarantees (linkGuarantee
// only blocks a DIFFERENT owner); this covers the new read that lists them all,
// most-recent first, and re-confirms the one-owner-per-guarantee constraint.

import { describe, it, expect } from "vitest";
import { MemoryRepository } from "./memory-repository";
import type { Guarantee } from "../types";

function g(over: Partial<Guarantee>): Guarantee {
  return {
    id: over.id!,
    salesOrderNumber: over.salesOrderNumber ?? over.id!,
    customerLastName: "Buyer",
    deliveryDate: "2026-06-01",
    createdAt: over.createdAt,
    ...over,
  };
}

describe("listGuaranteesForUser (B-28)", () => {
  it("returns every guarantee linked to the account, most recent first", async () => {
    const repo = new MemoryRepository([
      g({ id: "a", createdAt: "2026-03-01T00:00:00Z" }),
      g({ id: "b", createdAt: "2026-05-01T00:00:00Z" }),
      g({ id: "c", createdAt: "2026-04-01T00:00:00Z" }),
    ]);
    await repo.linkGuaranteeToUser("a", "user-1", "lookup");
    await repo.linkGuaranteeToUser("b", "user-1", "lookup");
    await repo.linkGuaranteeToUser("c", "user-1", "lookup");

    const list = await repo.listGuaranteesForUser("user-1");
    expect(list.map((x) => x.id)).toEqual(["b", "c", "a"]); // newest → oldest
  });

  it("scopes strictly to the account (never leaks another customer's purchase)", async () => {
    const repo = new MemoryRepository([g({ id: "mine" }), g({ id: "theirs" })]);
    await repo.linkGuaranteeToUser("mine", "user-1", "lookup");
    await repo.linkGuaranteeToUser("theirs", "user-2", "lookup");

    const list = await repo.listGuaranteesForUser("user-1");
    expect(list.map((x) => x.id)).toEqual(["mine"]);
  });

  it("returns [] for an account with no linked purchases", async () => {
    const repo = new MemoryRepository([g({ id: "a" })]);
    expect(await repo.listGuaranteesForUser("nobody")).toEqual([]);
  });

  it("still refuses to link a purchase already owned by a different account", async () => {
    const repo = new MemoryRepository([g({ id: "a" })]);
    await repo.linkGuaranteeToUser("a", "user-1", "lookup");
    // user-2 cannot steal it.
    expect(await repo.linkGuaranteeToUser("a", "user-2", "lookup")).toBeNull();
    // and the same account CAN own a second purchase (the B-28 point).
    const repo2 = new MemoryRepository([g({ id: "a" }), g({ id: "b" })]);
    await repo2.linkGuaranteeToUser("a", "user-1", "lookup");
    expect(await repo2.linkGuaranteeToUser("b", "user-1", "lookup")).not.toBeNull();
  });
});
