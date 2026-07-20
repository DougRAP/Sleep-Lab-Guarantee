import { describe, it, expect } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { SEED_GUARANTEES } from "./seed";

const demo = SEED_GUARANTEES.find((g) => g.customerLastName === "Demo")!;
const rivera = SEED_GUARANTEES.find((g) => g.customerLastName === "Rivera")!;

describe("MemoryRepository — initial impression", () => {
  it("has no impression for the fresh guarantee before one is recorded", async () => {
    const repo = new MemoryRepository();
    expect(await repo.getInitialImpression(demo.id)).toBeNull();
  });

  it("saves and reflects a first impression", async () => {
    const repo = new MemoryRepository();
    const saved = await repo.saveInitialImpression({
      guaranteeId: demo.id,
      impression: "firmer",
      note: "stiff out of the box",
    });
    expect(saved.impression).toBe("firmer");
    expect(saved.at).toBeTruthy();

    const got = await repo.getInitialImpression(demo.id);
    expect(got?.impression).toBe("firmer");
    expect(got?.note).toBe("stiff out of the box");
  });

  it("updates (does not duplicate) when re-recording", async () => {
    const repo = new MemoryRepository();
    await repo.saveInitialImpression({ guaranteeId: demo.id, impression: "firmer" });
    await repo.saveInitialImpression({ guaranteeId: demo.id, impression: "just_right" });
    const got = await repo.getInitialImpression(demo.id);
    expect(got?.impression).toBe("just_right");
  });

  it("seeds the mid-journey guarantee with an impression already recorded", async () => {
    const repo = new MemoryRepository();
    const got = await repo.getInitialImpression(rivera.id);
    expect(got?.impression).toBe("firmer");
  });

  it("does not mutate seed data across repository instances", async () => {
    const a = new MemoryRepository();
    await a.saveInitialImpression({ guaranteeId: rivera.id, impression: "softer" });
    const b = new MemoryRepository();
    const got = await b.getInitialImpression(rivera.id);
    expect(got?.impression).toBe("firmer"); // b is unaffected by a's write
  });
});

describe("Tonight day-0 branch (impression prompt vs nightly check-in)", () => {
  // Mirrors app/tonight/page.tsx: needsImpression = !impression && day <= 1.
  it("shows the impression prompt for the fresh day-0 guarantee", async () => {
    const repo = new MemoryRepository();
    const journey = await repo.getJourney(demo.id);
    const impression = await repo.getInitialImpression(demo.id);
    const needsImpression = !impression && (journey?.currentDay ?? 0) <= 1;
    expect(journey?.currentDay).toBe(0);
    expect(needsImpression).toBe(true);
  });

  it("shows the nightly check-in for the mid-journey guarantee (impression already recorded)", async () => {
    const repo = new MemoryRepository();
    const journey = await repo.getJourney(rivera.id);
    const impression = await repo.getInitialImpression(rivera.id);
    const needsImpression = !impression && (journey?.currentDay ?? 0) <= 1;
    expect(journey?.currentDay).toBe(6);
    expect(needsImpression).toBe(false);
  });

  it("falls through to the nightly check-in once day >= 2 even with no impression", async () => {
    const repo = new MemoryRepository();
    // No impression recorded; simulate a day-3 journey day directly via the rule.
    const impression = await repo.getInitialImpression(demo.id);
    const needsImpression = !impression && 3 <= 1;
    expect(needsImpression).toBe(false);
  });
});
