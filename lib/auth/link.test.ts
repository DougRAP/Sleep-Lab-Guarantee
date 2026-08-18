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

/* -------------------------------------------------------------------------- */
/* v3 (M-S5) — the relaxed link step: order OR ZIP OR claim number            */
/* -------------------------------------------------------------------------- */

import {
  LINK_CLAIM_TAKEN,
  LINK_NEED_DETAILS,
  LINK_NOT_FOUND,
  isClaimIdentifier,
  linkAccount,
} from "./link";

describe("isClaimIdentifier", () => {
  it("requires the CG prefix — a bare 6-character order is never a claim", () => {
    expect(isClaimIdentifier("CG7MKQ42")).toBe(true);
    expect(isClaimIdentifier("cg7mkq42")).toBe(true);
    expect(isClaimIdentifier("7MKQ42")).toBe(false);
    expect(isClaimIdentifier("234567")).toBe(false);
    expect(isClaimIdentifier("CG-7MKQ42")).toBe(false);
    expect(isClaimIdentifier("1011099412A")).toBe(false);
  });
});

describe("linkAccount — purchase by either key", () => {
  it("links by sales order + last name", async () => {
    const repo = new MemoryRepository();
    const result = await linkAccount(repo, USER, {
      identifier: "123",
      deliveryZip: "",
      lastName: "demo",
    });
    expect(result).toEqual({ ok: true, kind: "guarantee", guaranteeId: demo.id });
    expect((await repo.getGuaranteeForUser(USER))?.id).toBe(demo.id);
  });

  it("links by delivery ZIP + last name (Doug's missing-order case)", async () => {
    const repo = new MemoryRepository();
    const result = await linkAccount(repo, USER, {
      identifier: "",
      deliveryZip: "28150",
      lastName: "Calloway",
    });
    expect(result.ok).toBe(true);
    expect((await repo.getGuaranteeForUser(USER))?.customerLastName).toBe("Calloway");
  });

  it("an ambiguous ZIP match links nothing and offers the way through", async () => {
    // Kowalski also lives in 28150 — same-ZIP different names are fine, but a
    // twin Calloway in the same ZIP makes the key ambiguous.
    const twin = { ...SEED_GUARANTEES.find((g) => g.customerLastName === "Calloway")! };
    twin.id = "test-guarantee-calloway-2";
    twin.salesOrderNumber = "2022000009C";
    const repo = new MemoryRepository([...SEED_GUARANTEES, twin]);

    const result = await linkAccount(repo, USER, {
      identifier: "",
      deliveryZip: "28150",
      lastName: "Calloway",
    });
    expect(result).toEqual({ ok: false, error: LINK_NOT_FOUND, offerContinue: true });
    expect(await repo.getGuaranteeForUser(USER)).toBeNull();
  });

  it("no match is calm and continuable — never a dead-end", async () => {
    const repo = new MemoryRepository();
    const result = await linkAccount(repo, USER, {
      identifier: "no-such-order",
      deliveryZip: "99999",
      lastName: "Nobody",
    });
    expect(result).toEqual({ ok: false, error: LINK_NOT_FOUND, offerContinue: true });
  });

  it("asks for the missing pieces without offering continue", async () => {
    const repo = new MemoryRepository();
    expect(
      await linkAccount(repo, USER, { identifier: "", deliveryZip: "", lastName: "Demo" })
    ).toEqual({ ok: false, error: LINK_NEED_DETAILS, offerContinue: false });
    expect(
      await linkAccount(repo, USER, { identifier: "123", deliveryZip: "", lastName: "" })
    ).toEqual({ ok: false, error: LINK_NEED_DETAILS, offerContinue: false });
  });

  it("a purchase owned by another account stays theirs", async () => {
    const repo = new MemoryRepository();
    await repo.linkGuaranteeToUser(demo.id, OTHER_USER, "lookup");
    const result = await linkAccount(repo, USER, {
      identifier: "123",
      deliveryZip: "",
      lastName: "demo",
    });
    expect(result.ok).toBe(false);
    expect(await repo.getGuaranteeForUser(USER)).toBeNull();
  });
});

describe("linkAccount — claim number (CG…)", () => {
  it("links the seeded anonymous claim with the right last name", async () => {
    const repo = new MemoryRepository();
    const result = await linkAccount(repo, USER, {
      identifier: "CG7MKQ42",
      deliveryZip: "",
      lastName: "Osborne",
    });
    expect(result).toEqual({
      ok: true,
      kind: "claim",
      claimId: "seed-claim-osborne",
      guaranteeId: null,
    });
    expect((await repo.listClaimsForUser(USER)).map((c) => c.id)).toEqual([
      "seed-claim-osborne",
    ]);
  });

  it("a wrong last name is indistinguishable from a wrong number", async () => {
    const repo = new MemoryRepository();
    const wrongName = await linkAccount(repo, USER, {
      identifier: "CG7MKQ42",
      deliveryZip: "",
      lastName: "Rivera",
    });
    const wrongNumber = await linkAccount(repo, USER, {
      identifier: "CG222222",
      deliveryZip: "",
      lastName: "Osborne",
    });
    expect(wrongName).toEqual(wrongNumber);
    expect(wrongName).toEqual({
      ok: false,
      error: LINK_NOT_FOUND,
      offerContinue: true,
    });
    expect(await repo.listClaimsForUser(USER)).toEqual([]);
  });

  it("co-links the claim's guarantee when it has one", async () => {
    const repo = new MemoryRepository();
    // An anonymous claim that auto-matched Calloway's guarantee at submit.
    const draft = await repo.createAnonymousClaim({
      firstName: "Denise",
      lastName: "Calloway",
      deliveryZip: "28150",
    });
    const { claim, claimNumber } = await repo.submitClaim(draft.id);
    expect(claim.guaranteeId).toBeTruthy();

    const result = await linkAccount(repo, USER, {
      identifier: claimNumber,
      deliveryZip: "",
      lastName: "Calloway",
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "claim") {
      expect(result.guaranteeId).toBe(claim.guaranteeId);
    }
    expect((await repo.getGuaranteeForUser(USER))?.id).toBe(claim.guaranteeId);
    expect((await repo.listClaimsForUser(USER)).map((c) => c.id)).toEqual([claim.id]);
  });

  it("a claim already on another account is refused calmly", async () => {
    const repo = new MemoryRepository();
    await repo.linkClaimToUser("seed-claim-osborne", OTHER_USER);
    const result = await linkAccount(repo, USER, {
      identifier: "CG7MKQ42",
      deliveryZip: "",
      lastName: "Osborne",
    });
    expect(result).toEqual({
      ok: false,
      error: LINK_CLAIM_TAKEN,
      offerContinue: true,
    });
  });

  it("re-linking your own claim is idempotent", async () => {
    const repo = new MemoryRepository();
    await repo.linkClaimToUser("seed-claim-osborne", USER);
    const result = await linkAccount(repo, USER, {
      identifier: "cg7mkq42",
      deliveryZip: "",
      lastName: "Terri Osborne",
    });
    expect(result.ok).toBe(true);
  });
});
