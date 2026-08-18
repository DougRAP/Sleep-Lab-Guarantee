// lib/data/concierge-usage.test.ts
// B-11 data layer, privacy-adjusted design (2026-07-24): the raw usage row
// carries thread_id + numbers ONLY — no guarantee_id, no text. The report is a
// per-day aggregate with no identifiers at all.

import { describe, it, expect } from "vitest";
import { MemoryRepository } from "./memory-repository";
import type { ConciergeUsageInput } from "./repository";

function usage(over: Partial<ConciergeUsageInput> = {}): ConciergeUsageInput {
  return {
    threadId: "thread-1",
    model: "claude-haiku-4-5",
    apiCalls: 1,
    inputTokens: 100,
    outputTokens: 40,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    ...over,
  };
}

describe("MemoryRepository — concierge usage (B-11)", () => {
  it("records rows and aggregates them into one line per day", async () => {
    const repo = new MemoryRepository();
    await repo.recordConciergeUsage(usage());
    await repo.recordConciergeUsage(
      usage({ apiCalls: 2, inputTokens: 300, outputTokens: 90, cacheReadTokens: 50 })
    );

    const days = await repo.listConciergeUsageDaily();
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      replies: 2,
      apiCalls: 3,
      inputTokens: 400,
      outputTokens: 130,
      cacheCreationTokens: 0,
      cacheReadTokens: 50,
    });
    // The day is a plain date, and the aggregate carries no identifiers.
    expect(days[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect("threadId" in days[0]).toBe(false);
  });

  it("a fresh repository reports an empty list, not an error", async () => {
    const repo = new MemoryRepository();
    expect(await repo.listConciergeUsageDaily()).toEqual([]);
  });

  it("accepts a null thread id (an unlinked row is still a billed row)", async () => {
    const repo = new MemoryRepository();
    await repo.recordConciergeUsage(usage({ threadId: null }));
    const days = await repo.listConciergeUsageDaily();
    expect(days[0].replies).toBe(1);
  });
});
