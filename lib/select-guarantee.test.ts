// lib/select-guarantee.test.ts
// B-28: switching the active purchase is server-authoritative. The action only
// honors an id the account actually owns, and only sets the cookie then.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { setCookie } = vi.hoisted(() => ({ setCookie: vi.fn() }));

vi.mock("./auth/config", () => ({ isAuthConfigured: () => true }));
vi.mock("./auth/user", () => ({ getViewer: async () => ({ userId: "user-1", role: "consumer" }) }));
vi.mock("./active-guarantee", () => ({ setActiveGuaranteeCookie: setCookie }));

const owned = [{ id: "a" }, { id: "b" }];
vi.mock("./data", () => ({
  getRepository: () => ({ listGuaranteesForUser: async () => owned }),
}));

const { selectGuaranteeAction } = await import("./actions/select-guarantee");

beforeEach(() => setCookie.mockClear());

describe("selectGuaranteeAction (B-28)", () => {
  it("switches to a purchase the account owns and persists it", async () => {
    const res = await selectGuaranteeAction("b");
    expect(res.ok).toBe(true);
    expect(setCookie).toHaveBeenCalledWith("b");
  });

  it("refuses an id the account does not own, and sets no cookie", async () => {
    const res = await selectGuaranteeAction("someone-elses");
    expect(res.ok).toBe(false);
    expect(setCookie).not.toHaveBeenCalled();
  });
});
