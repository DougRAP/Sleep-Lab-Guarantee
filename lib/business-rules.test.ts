// lib/business-rules.test.ts
// The four business rules sent to Doug (email 2026-07-27), proven one-to-one as
// deterministic tests — no browser, no network, so they are 100% reproducible.
//
// Rules 3 and 4 ALSO have full-UI Playwright coverage (e2e/smoke.spec.ts,
// "re-filing a request"); rules 1 and 2 are a real-auth feature the in-memory
// e2e can't render, so their guarantee lives here at the engine/repo level.

import { describe, it, expect } from "vitest";
import { evaluateEligibility, RULES } from "./eligibility";
import { MemoryRepository } from "./data/memory-repository";
import { resolveActiveGuarantee } from "./active-guarantee";
import type { Guarantee } from "./types";

/** A delivery date N days before a fixed reference, so the window is exact. */
const REF = "2026-07-27T12:00:00.000Z";
function deliveredDaysAgo(n: number): string {
  return new Date(Date.parse(REF) - n * 86_400_000).toISOString();
}
function guarantee(over: Partial<Guarantee>): Guarantee {
  return {
    id: over.id!,
    salesOrderNumber: over.salesOrderNumber ?? over.id!,
    customerLastName: "Buyer",
    deliveryDate: "2026-06-01",
    ...over,
  };
}

// -------------------------------------------------------------------------
describe("Rule 1 — a customer can have several purchases under one account", () => {
  it("lists every purchase linked to the account, and switches between them", async () => {
    const repo = new MemoryRepository([
      guarantee({ id: "p1", createdAt: "2026-03-01T00:00:00Z" }),
      guarantee({ id: "p2", createdAt: "2026-05-01T00:00:00Z" }),
    ]);
    await repo.linkGuaranteeToUser("p1", "user-1", "lookup");
    await repo.linkGuaranteeToUser("p2", "user-1", "lookup");

    const owned = await repo.listGuaranteesForUser("user-1");
    expect(owned.map((g) => g.id)).toEqual(["p2", "p1"]); // both, newest first

    // Default active = most recent; selecting the other switches to it.
    expect(resolveActiveGuarantee(owned, undefined)?.id).toBe("p2");
    expect(resolveActiveGuarantee(owned, "p1")?.id).toBe("p1");
  });

  it("a single-purchase account is unaffected (no switching to do)", async () => {
    const repo = new MemoryRepository([guarantee({ id: "only" })]);
    await repo.linkGuaranteeToUser("only", "user-1", "lookup");
    const owned = await repo.listGuaranteesForUser("user-1");
    expect(owned).toHaveLength(1);
    expect(resolveActiveGuarantee(owned, "stale")?.id).toBe("only");
  });
});

// -------------------------------------------------------------------------
describe("Rule 2 — a purchase belongs to one customer only", () => {
  it("a sales order already tied to an account cannot be claimed by another", async () => {
    const repo = new MemoryRepository([guarantee({ id: "p1" })]);
    await repo.linkGuaranteeToUser("p1", "user-1", "lookup");
    // A different account cannot take it.
    expect(await repo.linkGuaranteeToUser("p1", "user-2", "lookup")).toBeNull();
    // And user-2 never sees it in their own list.
    expect(await repo.listGuaranteesForUser("user-2")).toEqual([]);
  });

  it("a stale/foreign active selection never resolves to someone else's purchase", async () => {
    const repo = new MemoryRepository([
      guarantee({ id: "mine" }),
      guarantee({ id: "theirs" }),
    ]);
    await repo.linkGuaranteeToUser("mine", "user-1", "lookup");
    await repo.linkGuaranteeToUser("theirs", "user-2", "lookup");
    const owned = await repo.listGuaranteesForUser("user-1");
    // Even if the cookie points at "theirs", the account only ever gets "mine".
    expect(resolveActiveGuarantee(owned, "theirs")?.id).toBe("mine");
  });
});

// -------------------------------------------------------------------------
describe("Rule 3 — a denied/prior request no longer blocks re-filing", () => {
  it("the one-request-per-order rule is gone from the engine", () => {
    expect(RULES).not.toHaveProperty("ONE_REQUEST_PER_ORDER");
  });

  it("in the window, a customer is eligible regardless of prior submitted requests", () => {
    const r = evaluateEligibility({ deliveryDate: deliveredDaysAgo(40), referenceDate: REF });
    expect(r.eligible).toBe(true);
  });
});

// -------------------------------------------------------------------------
describe("Rule 4 — one actual exchange per mattress set (the guarantee)", () => {
  it("a completed/approved exchange blocks a new one, citing the one-time rule", () => {
    const r = evaluateEligibility({
      deliveryDate: deliveredDaysAgo(40),
      referenceDate: REF,
      exchangeResolved: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.reasons.map((x) => x.ruleId)).toContain(RULES.ONE_TIME_ONLY.id);
  });

  it("is keyed by guarantee (mattress set): an approved claim resolves that guarantee", async () => {
    const repo = new MemoryRepository();
    // Natarajan's seeded claim is 'approved' → the exchange is resolved.
    expect(await repo.hasResolvedExchange("seed-guarantee-natarajan")).toBe(true);
    // A fresh guarantee with no claim is not resolved.
    expect(await repo.hasResolvedExchange("seed-guarantee-demo")).toBe(false);
  });
});
