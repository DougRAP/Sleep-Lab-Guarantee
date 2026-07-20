import { describe, it, expect } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { SEED_GUARANTEES } from "./seed";

const g = SEED_GUARANTEES[0];

describe("MemoryRepository — verify (Path B: lookup)", () => {
  const repo = new MemoryRepository();

  it("verifies with correct sales order + last name (case-insensitive)", async () => {
    const r = await repo.verifyGuarantee({
      mode: "lookup",
      salesOrderNumber: "123",
      lastName: "DEMO",
    });
    expect(r?.id).toBe(g.id);
  });

  it("accepts a full name and finds the last-name match", async () => {
    const r = await repo.verifyGuarantee({
      mode: "lookup",
      salesOrderNumber: g.salesOrderNumber,
      lastName: "Andrew Demo",
    });
    expect(r?.id).toBe(g.id);
  });

  it("rejects a wrong last name", async () => {
    const r = await repo.verifyGuarantee({
      mode: "lookup",
      salesOrderNumber: g.salesOrderNumber,
      lastName: "Nguyen",
    });
    expect(r).toBeNull();
  });

  it("rejects an unknown sales order", async () => {
    const r = await repo.verifyGuarantee({
      mode: "lookup",
      salesOrderNumber: "does-not-exist",
      lastName: "Demo",
    });
    expect(r).toBeNull();
  });
});

describe("MemoryRepository — verify (Path A: token)", () => {
  const repo = new MemoryRepository();

  it("verifies with token + last name + matching delivery date", async () => {
    const r = await repo.verifyGuarantee({
      mode: "token",
      token: g.accessToken!,
      lastName: "Demo",
      deliveryDate: g.deliveryDate,
    });
    expect(r?.id).toBe(g.id);
  });

  it("rejects a mismatched delivery date", async () => {
    const r = await repo.verifyGuarantee({
      mode: "token",
      token: g.accessToken!,
      lastName: "Demo",
      deliveryDate: "2000-01-01",
    });
    expect(r).toBeNull();
  });
});

describe("MemoryRepository — journey", () => {
  const repo = new MemoryRepository();

  it("computes day 0 (fresh purchase) in the settle_in phase for the demo guarantee", async () => {
    const j = await repo.getJourney(g.id);
    expect(j?.currentDay).toBe(0);
    expect(j?.phase).toBe("settle_in");
  });

  it("returns only active tips", async () => {
    const tips = await repo.listTips();
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every((t) => t.active)).toBe(true);
  });
});
