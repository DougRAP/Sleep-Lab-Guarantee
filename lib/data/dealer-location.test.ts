import { describe, it, expect } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { SEED_DEALER_LOCATIONS, SEED_GUARANTEES } from "./seed";
import type { DealerLocation, Guarantee } from "../types";

const turnbull = SEED_GUARANTEES.find((g) => g.id === "seed-guarantee-turnbull")!;
const rivera = SEED_GUARANTEES.find((g) => g.id === "seed-guarantee-rivera")!;

describe("dealer_locations — placeholder seed", () => {
  it("seeds a single placeholder dealer keyed to location '101'", () => {
    expect(SEED_DEALER_LOCATIONS).toHaveLength(1);
    const d = SEED_DEALER_LOCATIONS[0];
    expect(d).toMatchObject({
      id: "101",
      name: "Demo Bedding Co.",
      phone: "(555) 012-3456",
      email: "care@demobedding.example",
      siteUrl: "https://example.com/shop",
      couponCode: "SLEEPLAB20",
      couponPct: 20,
    });
  });

  it("both demo guarantees point at the seeded location id", () => {
    expect(turnbull.dealerLocationId).toBe("101");
    expect(rivera.dealerLocationId).toBe("101");
  });
});

describe("MemoryRepository — dealer locations", () => {
  const repo = new MemoryRepository();

  it("getDealerLocationById returns the placeholder dealer", async () => {
    const d = await repo.getDealerLocationById("101");
    expect(d?.name).toBe("Demo Bedding Co.");
    expect(d?.couponCode).toBe("SLEEPLAB20");
  });

  it("getDealerLocationById is whitespace-tolerant", async () => {
    const d = await repo.getDealerLocationById("  101  ");
    expect(d?.id).toBe("101");
  });

  it("getDealerLocationById returns null for an unknown id", async () => {
    expect(await repo.getDealerLocationById("nope")).toBeNull();
  });

  it("resolves both demo guarantees to the same dealer (Turnbull + Rivera)", async () => {
    const a = await repo.getDealerLocationForGuarantee(turnbull.id);
    const b = await repo.getDealerLocationForGuarantee(rivera.id);
    expect(a?.name).toBe("Demo Bedding Co.");
    expect(b?.id).toBe("101");
  });

  it("returns a copy, not the shared seed object (no mutation leak)", async () => {
    const d = await repo.getDealerLocationById("101");
    expect(d).not.toBe(SEED_DEALER_LOCATIONS[0]);
  });

  it("falls back to null when the guarantee is unknown", async () => {
    expect(await repo.getDealerLocationForGuarantee("no-such-guarantee")).toBeNull();
  });

  it("falls back to null when the guarantee has no dealer location on file", async () => {
    const orphan: Guarantee = {
      ...turnbull,
      id: "guarantee-no-location",
      dealerLocationId: null,
    };
    const repoWithOrphan = new MemoryRepository([orphan]);
    expect(await repoWithOrphan.getDealerLocationForGuarantee(orphan.id)).toBeNull();
  });

  it("falls back to null when the guarantee points at a missing location", async () => {
    const dangling: Guarantee = {
      ...turnbull,
      id: "guarantee-dangling",
      dealerLocationId: "999",
    };
    const repoWithDangling = new MemoryRepository([dangling]);
    expect(
      await repoWithDangling.getDealerLocationForGuarantee(dangling.id)
    ).toBeNull();
  });

  it("accepts an injected dealer-location set (custom fixtures)", async () => {
    const custom: DealerLocation[] = [
      { id: "101", name: "Custom Co.", couponCode: "TEST10", couponPct: 10 },
    ];
    const customRepo = new MemoryRepository(SEED_GUARANTEES, undefined, undefined, custom);
    const d = await customRepo.getDealerLocationForGuarantee(turnbull.id);
    expect(d?.name).toBe("Custom Co.");
  });
});
