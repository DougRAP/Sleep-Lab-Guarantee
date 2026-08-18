// lib/concierge-quota-action.test.ts
// B-13 Piezas 2/3: sendConciergeMessage rests (does not call the model) once the
// per-guarantee daily limit is reached, and the input-cap is applied. No API key
// is set, so the "allowed" path exercises the scripted fallback (offline-safe).
//
// v3 (M-S3): the Coach only exists in the companion product, so these specs opt
// out of claims mode (now the default) — the action refuses outright otherwise,
// which is its own test below.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { MemoryRepository } from "./data/memory-repository";

const repo = new MemoryRepository();
vi.mock("./data", () => ({ getRepository: () => repo }));
vi.mock("./auth/app-session", () => ({
  getAppSession: async () => ({ guaranteeId: "seed-guarantee-demo" }),
}));

const { sendConciergeMessage } = await import("./actions/concierge");

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  // The companion product — where a coach exists at all (v3 M-S3).
  vi.stubEnv("NEXT_PUBLIC_CLAIMS_MODE", "false");
});

afterAll(() => vi.unstubAllEnvs());

describe("sendConciergeMessage — daily quota (B-13)", () => {
  it("rests with the warm message once the per-guarantee limit is reached", async () => {
    vi.spyOn(repo, "getAppSettings").mockResolvedValue({ chat_messages_per_day: 1 });
    // First reply lands (count 0 < 1).
    const first = await sendConciergeMessage("too firm");
    expect(first.ok).toBe(true);
    expect("resting" in first).toBe(false);

    // Now one assistant reply exists → count 1 >= 1 → rest.
    const second = await sendConciergeMessage("still too firm");
    expect(second).toMatchObject({ ok: true, resting: true });
    if ("message" in second) expect(second.message.toLowerCase()).toContain("tomorrow");
  });

  it("rests on the global fuse regardless of the customer's own count", async () => {
    // A generous per-guarantee limit but a tiny global fuse. Any prior replies
    // in the shared store already push the global count to or past 1, so the
    // next send must rest on the global scope even though this customer is light.
    vi.spyOn(repo, "getAppSettings").mockResolvedValue({
      chat_messages_per_day: 1000,
      chat_global_messages_per_day: 1,
    });
    const thread = await repo.getOrCreateConciergeThread("seed-guarantee-demo");
    await repo.addConciergeMessage(thread.id, "assistant", "seed reply");
    const res = await sendConciergeMessage("hello");
    expect(res).toMatchObject({ ok: true, resting: true });
  });
});

describe("the Coach is disabled in claims mode (v3 M-S3)", () => {
  it("refuses calmly instead of spending a token, whatever the quota says", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLAIMS_MODE", "true");
    const settings = vi.spyOn(repo, "getAppSettings");
    const res = await sendConciergeMessage("too firm");
    expect(res.ok).toBe(false);
    // It never even reaches the quota machinery — the door closes first.
    expect(settings).not.toHaveBeenCalled();
    if ("error" in res) expect(res.error).not.toMatch(/error|failed/i);
  });

  it("is closed by the default too — claims mode needs no flag (unset env)", async () => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_CLAIMS_MODE;
    const res = await sendConciergeMessage("too firm");
    expect(res.ok).toBe(false);
  });
});
