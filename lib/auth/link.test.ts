import { describe, it, expect } from "vitest";
import { MemoryRepository } from "../data/memory-repository";
import { SEED_GUARANTEES } from "../data/seed";
import { LINK_MISSING, LINK_NO_MATCH, LINK_TAKEN, linkPurchase } from "./link";

const demo = SEED_GUARANTEES.find((g) => g.id === "seed-guarantee-demo")!;
const rivera = SEED_GUARANTEES.find((g) => g.id === "seed-guarantee-rivera")!;

const USER = "auth-user-1";
const OTHER_USER = "auth-user-2";

describe("linkPurchase — sales order + last name", () => {
  it("links when both details match", async () => {
    const repo = new MemoryRepository();
    const result = await linkPurchase(repo, USER, {
      mode: "lookup",
      salesOrderNumber: "123",
      lastName: "demo",
    });

    expect(result).toEqual({ ok: true, guaranteeId: demo.id, via: "lookup" });
    const linked = await repo.getGuaranteeForUser(USER);
    expect(linked?.id).toBe(demo.id);
    expect(linked?.linkedVia).toBe("lookup");
  });

  it("is case- and whitespace-insensitive, and takes a full name", async () => {
    const repo = new MemoryRepository();
    const result = await linkPurchase(repo, USER, {
      mode: "lookup",
      salesOrderNumber: "  123  ",
      lastName: "Andrew DEMO",
    });
    expect(result.ok).toBe(true);
  });

  it("does NOT link on a wrong last name", async () => {
    const repo = new MemoryRepository();
    const result = await linkPurchase(repo, USER, {
      mode: "lookup",
      salesOrderNumber: "123",
      lastName: "Nguyen",
    });

    expect(result).toEqual({ ok: false, error: LINK_NO_MATCH });
    expect(await repo.getGuaranteeForUser(USER)).toBeNull();
  });

  it("does NOT link on an unknown sales order", async () => {
    const repo = new MemoryRepository();
    const result = await linkPurchase(repo, USER, {
      mode: "lookup",
      salesOrderNumber: "does-not-exist",
      lastName: "demo",
    });

    expect(result).toEqual({ ok: false, error: LINK_NO_MATCH });
    expect(await repo.getGuaranteeForUser(USER)).toBeNull();
  });

  it("asks calmly for anything missing rather than guessing", async () => {
    const repo = new MemoryRepository();
    const result = await linkPurchase(repo, USER, {
      mode: "lookup",
      salesOrderNumber: "123",
      lastName: "   ",
    });
    expect(result).toEqual({ ok: false, error: LINK_MISSING });
  });

  it("leaves other purchases untouched", async () => {
    const repo = new MemoryRepository();
    await linkPurchase(repo, USER, {
      mode: "lookup",
      salesOrderNumber: "123",
      lastName: "demo",
    });
    expect((await repo.getGuaranteeById(rivera.id))?.consumerId).toBeFalsy();
  });
});

describe("linkPurchase — dashboard token", () => {
  it("links automatically and records that the order was pre-verified", async () => {
    const repo = new MemoryRepository();
    const result = await linkPurchase(repo, USER, {
      mode: "token",
      token: demo.accessToken!,
    });

    expect(result).toEqual({ ok: true, guaranteeId: demo.id, via: "token" });
    // "token" is what lets the fitting skip the receipt photo later.
    expect((await repo.getGuaranteeForUser(USER))?.linkedVia).toBe("token");
  });

  it("does NOT link on an unknown token", async () => {
    const repo = new MemoryRepository();
    const result = await linkPurchase(repo, USER, { mode: "token", token: "nope" });
    expect(result).toEqual({ ok: false, error: LINK_NO_MATCH });
  });
});

describe("linkPurchase — one purchase, one account", () => {
  it("refuses a purchase already linked to someone else", async () => {
    const repo = new MemoryRepository();
    await linkPurchase(repo, OTHER_USER, {
      mode: "lookup",
      salesOrderNumber: "123",
      lastName: "demo",
    });

    const result = await linkPurchase(repo, USER, {
      mode: "lookup",
      salesOrderNumber: "123",
      lastName: "demo",
    });

    expect(result).toEqual({ ok: false, error: LINK_TAKEN });
    expect(await repo.getGuaranteeForUser(USER)).toBeNull();
    expect((await repo.getGuaranteeForUser(OTHER_USER))?.id).toBe(demo.id);
  });

  it("is idempotent for the account that already owns it", async () => {
    const repo = new MemoryRepository();
    await linkPurchase(repo, USER, {
      mode: "lookup",
      salesOrderNumber: "123",
      lastName: "demo",
    });
    const again = await linkPurchase(repo, USER, {
      mode: "token",
      token: demo.accessToken!,
    });
    expect(again.ok).toBe(true);
  });

  it("needs an authenticated user — linking is never the login", async () => {
    const repo = new MemoryRepository();
    const result = await linkPurchase(repo, "", {
      mode: "lookup",
      salesOrderNumber: "123",
      lastName: "demo",
    });
    expect(result.ok).toBe(false);
    // A correct sales order number on its own granted nothing.
    expect((await repo.getGuaranteeById(demo.id))?.consumerId).toBeFalsy();
  });

  it("does not leak a link between repository instances", async () => {
    const a = new MemoryRepository();
    await linkPurchase(a, USER, {
      mode: "lookup",
      salesOrderNumber: "123",
      lastName: "demo",
    });
    const b = new MemoryRepository();
    expect(await b.getGuaranteeForUser(USER)).toBeNull();
  });
});
