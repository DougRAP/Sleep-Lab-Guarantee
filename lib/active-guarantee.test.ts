// lib/active-guarantee.test.ts
// B-28: which of an account's purchases is "active" right now. Pure resolution,
// so the cookie/session plumbing stays thin. The rule: honor the selected id
// when the account actually owns it; otherwise fall back to the most recent
// (the list's head). Never returns a guarantee the account doesn't own.

import { describe, it, expect } from "vitest";
import { resolveActiveGuarantee } from "./active-guarantee";
import type { Guarantee } from "./types";

const G = (id: string): Guarantee => ({
  id,
  salesOrderNumber: id,
  customerLastName: "Buyer",
  deliveryDate: "2026-06-01",
});

const list = [G("newest"), G("middle"), G("oldest")]; // already most-recent first

describe("resolveActiveGuarantee", () => {
  it("returns the selected purchase when the account owns it", () => {
    expect(resolveActiveGuarantee(list, "middle")?.id).toBe("middle");
  });

  it("falls back to the most recent when nothing is selected", () => {
    expect(resolveActiveGuarantee(list, undefined)?.id).toBe("newest");
  });

  it("falls back to the most recent when the selected id isn't owned (stale cookie)", () => {
    expect(resolveActiveGuarantee(list, "someone-elses")?.id).toBe("newest");
  });

  it("returns null for an account with no purchases", () => {
    expect(resolveActiveGuarantee([], "anything")).toBeNull();
  });

  it("a single-purchase account always resolves to that one", () => {
    expect(resolveActiveGuarantee([G("only")], undefined)?.id).toBe("only");
    expect(resolveActiveGuarantee([G("only")], "stale")?.id).toBe("only");
  });
});
