// lib/chat-quota.test.ts
// B-13 Piezas 2/4: the chat quota decision is pure. A reply is allowed while
// BOTH the per-guarantee daily count and the program-wide daily count are under
// their limits. At either limit the coach "rests" until tomorrow.

import { describe, it, expect } from "vitest";
import { decideChatQuota, capInput, RESTING_MESSAGE } from "./chat-quota";

describe("decideChatQuota", () => {
  const base = { perGuaranteeCount: 0, perGuaranteeLimit: 300, globalCount: 0, globalLimit: 20000 };

  it("allows when both counts are under their limits", () => {
    expect(decideChatQuota({ ...base, perGuaranteeCount: 299, globalCount: 5000 }).allowed).toBe(true);
  });

  it("rests when the per-guarantee daily limit is reached", () => {
    const d = decideChatQuota({ ...base, perGuaranteeCount: 300 });
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe("guarantee");
  });

  it("rests when the global daily fuse is reached, even if the customer is light", () => {
    const d = decideChatQuota({ ...base, perGuaranteeCount: 2, globalCount: 20000 });
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe("global");
  });

  it("the resting message is warm and mentions tomorrow", () => {
    expect(RESTING_MESSAGE.toLowerCase()).toContain("tomorrow");
    expect(RESTING_MESSAGE).not.toMatch(/error|denied|blocked/i);
  });
});

describe("capInput", () => {
  it("leaves a normal message untouched", () => {
    expect(capInput("Too firm for me.", 1500)).toBe("Too firm for me.");
  });
  it("trims a giant paste to the cap (bounds the token cost)", () => {
    const huge = "x".repeat(5000);
    expect(capInput(huge, 1500)).toHaveLength(1500);
  });
});
