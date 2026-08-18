// lib/data/rate-limit-repo.test.ts
// B-13: the DB primitives behind rate limiting and chat quotas, on the memory
// backend (the Supabase one mirrors them).

import { describe, it, expect } from "vitest";
import { MemoryRepository } from "./memory-repository";

describe("MemoryRepository — rate counter (atomic bump)", () => {
  it("increments per (bucket, key, window) and isolates each triple", async () => {
    const repo = new MemoryRepository();
    const w = "2026-07-24T17:15:00.000Z";
    expect(await repo.bumpRateCounter("ip", "1.2.3.4", w)).toBe(1);
    expect(await repo.bumpRateCounter("ip", "1.2.3.4", w)).toBe(2);
    // A different key is its own counter.
    expect(await repo.bumpRateCounter("ip", "5.6.7.8", w)).toBe(1);
    // A different window resets.
    expect(await repo.bumpRateCounter("ip", "1.2.3.4", "2026-07-24T17:30:00.000Z")).toBe(1);
  });
});

describe("MemoryRepository — app settings", () => {
  it("is empty by default (callers fall back to code defaults)", async () => {
    const repo = new MemoryRepository();
    expect(await repo.getAppSettings()).toEqual({});
  });
});

describe("MemoryRepository — concierge reply counts (chat quota)", () => {
  it("counts assistant replies for a guarantee since a cutoff, ignoring user turns", async () => {
    const repo = new MemoryRepository();
    const g = (await repo.getGuaranteeById("seed-guarantee-demo"))!;
    const thread = await repo.getOrCreateConciergeThread(g.id);
    await repo.addConciergeMessage(thread.id, "user", "hi");
    await repo.addConciergeMessage(thread.id, "assistant", "hello");
    await repo.addConciergeMessage(thread.id, "assistant", "again");

    const since = new Date(Date.now() - 86_400_000).toISOString();
    expect(await repo.countConciergeRepliesSince(g.id, since)).toBe(2);
    expect(await repo.countConciergeRepliesGlobalSince(since)).toBe(2);
  });

  it("a cutoff in the future counts nothing", async () => {
    const repo = new MemoryRepository();
    const g = (await repo.getGuaranteeById("seed-guarantee-demo"))!;
    const thread = await repo.getOrCreateConciergeThread(g.id);
    await repo.addConciergeMessage(thread.id, "assistant", "hello");
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(await repo.countConciergeRepliesSince(g.id, future)).toBe(0);
  });
});
