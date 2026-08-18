// lib/intake-quota-action.test.ts
// P1 #5 (audit 2026-07-28): the fitting intake talks to Anthropic just like the
// coach, but shipped without any spend guard. This proves sendIntakeMessage now
// enforces a per-guarantee HOURLY rate limit BEFORE calling the model, resting
// calmly when tripped. No API key is set, so the allowed path exercises the
// offline scripted fallback (same discipline as the concierge quota test).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRepository } from "./data/memory-repository";
import { INTAKE_RESTING_REPLY } from "./fitting-intake";

const repo = new MemoryRepository();
vi.mock("./data", () => ({ getRepository: () => repo }));
vi.mock("./auth/app-session", () => ({
  getAppSession: async () => ({
    guaranteeId: "seed-guarantee-demo",
    via: "lookup",
    userId: null,
    role: null,
    email: null,
  }),
  isPreVerifiedSession: () => false,
}));
// Fixed reference date so the journey read never touches next/headers cookies.
vi.mock("./demo-server", () => ({
  effectiveReferenceDate: async () => new Date("2026-07-10T12:00:00.000Z"),
}));

const { sendIntakeMessage } = await import("./actions/fitting");

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  // Isolate rate-counter state between tests (the shared repo persists it, and
  // the global fuse uses a fixed key across every test).
  (repo as unknown as { rateCounters: Map<string, number> }).rateCounters.clear();
});

describe("sendIntakeMessage — hourly rate limit (P1 #5)", () => {
  it("rests calmly once the per-guarantee hourly limit is reached, without calling the model", async () => {
    vi.spyOn(repo, "getAppSettings").mockResolvedValue({ intake_messages_per_hour: 1 });
    await repo.createDraftClaim({ guaranteeId: "seed-guarantee-demo", preVerified: false });

    // First message is under the limit (count 1 <= 1): it proceeds.
    const first = await sendIntakeMessage("my back hurts on this mattress");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.reply).not.toBe(INTAKE_RESTING_REPLY);

    // Second trips the hourly limit (count 2 > 1): the coach rests, model unused.
    const second = await sendIntakeMessage("still too firm for me");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.reply).toBe(INTAKE_RESTING_REPLY);
  });

  it("rests on the GLOBAL fuse even when the per-guarantee limit is generous", async () => {
    // A high per-guarantee limit but a tiny program-wide fuse: a distributed
    // caller can't bypass the per-guarantee cap by spreading across guarantees.
    vi.spyOn(repo, "getAppSettings").mockResolvedValue({
      intake_messages_per_hour: 1000,
      intake_messages_global_per_hour: 1,
    });
    await repo.createDraftClaim({ guaranteeId: "seed-guarantee-demo", preVerified: false });

    const first = await sendIntakeMessage("first message");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.reply).not.toBe(INTAKE_RESTING_REPLY);

    // Global count is now 1 >= 1 → the next intake message rests, program-wide.
    const second = await sendIntakeMessage("second message");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.reply).toBe(INTAKE_RESTING_REPLY);
  });
});
