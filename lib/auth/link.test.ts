import { describe, it, expect } from "vitest";
import { MemoryRepository } from "../data/memory-repository";
import type { Claim } from "../types";
import { SEED_GUARANTEES } from "../data/seed";
import {
  LINK_MISSING,
  LINK_NO_MATCH,
  LINK_TAKEN,
  ATTACH_WINDOW_HOURS,
  attachIntakeClaim,
  canDisarmForStaff,
  claimantHasAccount,
  linkPurchase,
  type AttachIntakeInput,
} from "./link";

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

/* -------------------------------------------------------------------------- */
/* R-4 — the account picks up the request it was made for                     */
/* -------------------------------------------------------------------------- */

// The confirmation screen invites the customer to make an account to follow
// their request, and the request did not come with them: they had to go to
// /requests and retype the CG number and their last name, minutes after filing,
// while the app held the claim's id in a cookie the whole time.
//
// The first cut let the cookie alone decide, and the ownership review refused
// it. The cookie proves a BROWSER filed the claim, not a person, and it is a
// seven-day bearer token: on a family tablet or a showroom device, the next
// person to sign in took the request, permanently, because nothing in this app
// can unlink a claim.
//
// So: the purchase is no longer handed over at all, the window is bound to the
// submission rather than to the draft, and the address on the account must
// match the one given at intake. Only signInAction calls this. Creating an
// account proves nothing while email confirmation is off, and the people who
// know the address typed into a shared browser are exactly the household and
// the showroom staff the guard exists to stop.

const CLAIM_EMAIL = "terri@rapqa.com";

/** A submitted claim, the only kind this rule will attach. */
async function submittedClaim(
  r: MemoryRepository,
  overrides: {
    lastName?: string;
    salesOrderNumber?: string;
    contactEmail?: string | null;
  } = {}
) {
  const claim = await r.createAnonymousClaim({
    firstName: "Terri",
    lastName: overrides.lastName ?? "Osborne",
    deliveryZip: "28105",
  });
  await r.updateClaim(claim.id, {
    contactEmail:
      overrides.contactEmail === undefined ? CLAIM_EMAIL : overrides.contactEmail,
    ...(overrides.salesOrderNumber
      ? { salesOrderNumber: overrides.salesOrderNumber }
      : {}),
  });
  if (overrides.salesOrderNumber) await r.linkClaimToGuaranteeIfMatched(claim.id);
  const { claim: submitted } = await r.submitClaim(claim.id);
  return submitted;
}

/** A clock N hours past the moment this claim was actually filed. */
function hoursAfterSubmission(claim: Claim, hours: number): Date {
  return new Date(new Date(claim.submittedAt!).getTime() + hours * 3_600_000);
}

/** The shape the sign-in door passes in, with the happy defaults. */
function attempt(overrides: Partial<AttachIntakeInput> = {}): AttachIntakeInput {
  return {
    claimId: "",
    email: CLAIM_EMAIL,
    role: "consumer",
    ...overrides,
  };
}

describe("attachIntakeClaim — what the login picks up on its way past", () => {
  it("attaches the request this browser filed", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);

    const attached = await attachIntakeClaim(r, USER, attempt({ claimId: claim.id }));

    expect(attached?.id).toBe(claim.id);
    expect((await r.listClaimsForUser(USER)).map((c) => c.id)).toEqual([claim.id]);
  });

  it("is idempotent — signing in again changes nothing", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);

    await attachIntakeClaim(r, USER, attempt({ claimId: claim.id }));
    const again = await attachIntakeClaim(r, USER, attempt({ claimId: claim.id }));

    expect(again?.id).toBe(claim.id);
    expect((await r.listClaimsForUser(USER)).length).toBe(1);
  });

  it("leaves a request that already belongs to someone else alone", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);
    await r.linkClaimToUser(claim.id, OTHER_USER);

    expect(await attachIntakeClaim(r, USER, attempt({ claimId: claim.id }))).toBeNull();
    expect((await r.listClaimsForUser(USER)).length).toBe(0);
    expect((await r.listClaimsForUser(OTHER_USER)).length).toBe(1);
  });

  it("refuses a draft — it is not a filed request yet", async () => {
    const r = new MemoryRepository();
    const draft = await r.createAnonymousClaim({
      firstName: "Terri",
      lastName: "Osborne",
      deliveryZip: "28105",
    });

    expect(await attachIntakeClaim(r, USER, attempt({ claimId: draft.id }))).toBeNull();
  });

  it("refuses a claim id that names nothing, and a missing user", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);
    expect(await attachIntakeClaim(r, USER, attempt({ claimId: "nope" }))).toBeNull();
    expect(await attachIntakeClaim(r, "  ", attempt({ claimId: claim.id }))).toBeNull();
  });

  it("refuses staff — an agent must never own a customer's request", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);

    for (const role of ["rap_admin", "dealer"] as const) {
      expect(
        await attachIntakeClaim(r, USER, attempt({ claimId: claim.id, role }))
      ).toBeNull();
    }
    expect((await r.listClaimsForUser(USER)).length).toBe(0);
  });
});

describe("attachIntakeClaim — the email is the second factor", () => {
  // A cookie proves a browser, not a person. Requiring the account's email to
  // match the one given at intake costs the customer nothing to type and closes
  // the family tablet, the showroom device and the borrowed laptop.
  it("refuses when the account signing in is not the one that was contacted", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);

    const attached = await attachIntakeClaim(
      r,
      USER,
      attempt({ claimId: claim.id, email: "someone.else@rapqa.com" })
    );

    expect(attached).toBeNull();
    expect((await r.listClaimsForUser(USER)).length).toBe(0);
  });

  it("ignores case and surrounding space, the way people type", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);

    const attached = await attachIntakeClaim(
      r,
      USER,
      attempt({ claimId: claim.id, email: "  Terri@RAPQA.com " })
    );

    expect(attached?.id).toBe(claim.id);
  });

  it("refuses when either side has no email at all", async () => {
    const r = new MemoryRepository();
    // A claim filed with only a mobile number: the manual form is their path.
    const phoneOnly = await submittedClaim(r, { contactEmail: null });
    expect(
      await attachIntakeClaim(r, USER, attempt({ claimId: phoneOnly.id }))
    ).toBeNull();

    const claim = await submittedClaim(r);
    expect(
      await attachIntakeClaim(r, USER, attempt({ claimId: claim.id, email: null }))
    ).toBeNull();
  });
});

describe("attachIntakeClaim — the window belongs to the submission", () => {
  // The cookie's own seven days are anchored at DRAFT creation and never
  // refreshed, so a customer who spent six days hunting for the law tag got a
  // one-day courtesy while a stranger on a shared device got the full week.
  // This window starts when the request was actually filed.
  it("attaches inside the window", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);
    const later = hoursAfterSubmission(claim, ATTACH_WINDOW_HOURS - 1);

    expect(
      (await attachIntakeClaim(r, USER, attempt({ claimId: claim.id, now: later })))?.id
    ).toBe(claim.id);
  });

  it("refuses once the window has passed", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);
    const later = hoursAfterSubmission(claim, ATTACH_WINDOW_HOURS + 1);

    expect(
      await attachIntakeClaim(r, USER, attempt({ claimId: claim.id, now: later }))
    ).toBeNull();
  });
});

describe("attachIntakeClaim — the purchase is not part of the deal", () => {
  it("never hands over the guarantee, even when the claim found one", async () => {
    // The ownership review: owning a filed request is small and mostly
    // recoverable; owning a PURCHASE unlocks the customer's name, phone, email
    // and home address on the RA document, and the ability to start an exchange
    // against it. That is not something a cookie may grant. The manual link
    // step is where a customer asserts a purchase is theirs.
    const r = new MemoryRepository();
    const claim = await submittedClaim(r, { lastName: "Demo", salesOrderNumber: "123" });
    expect(claim.guaranteeId).toBe(demo.id);

    const attached = await attachIntakeClaim(r, USER, attempt({ claimId: claim.id }));

    expect(attached?.id).toBe(claim.id);
    expect(await r.getGuaranteeForUser(USER)).toBeNull();
  });

  it("leaves an existing purchase link exactly as it was", async () => {
    // The first cut re-linked with via "lookup" on every sign-in, downgrading a
    // dashboard arrival from "token" and costing the customer the receipt-photo
    // exemption that pre-verification exists to give them.
    const r = new MemoryRepository();
    const claim = await submittedClaim(r, { lastName: "Demo", salesOrderNumber: "123" });
    await r.linkGuaranteeToUser(demo.id, USER, "token");

    await attachIntakeClaim(r, USER, attempt({ claimId: claim.id }));

    expect((await r.getGuaranteeForUser(USER))?.linkedVia).toBe("token");
  });
});

describe("canDisarmForStaff — what a staff sign-in may delete", () => {
  // An agent signing in on a showroom tablet must not carry a customer's claim
  // around, so the first cut always deleted the cookie. Two reviewers caught
  // the same unrecoverable case: a live draft has no CG number and no owner,
  // so the cookie is the only thing in the world that names it.
  it("disarms a filed request — the customer still holds its CG number", async () => {
    const r = new MemoryRepository();
    const claim = await submittedClaim(r);
    expect(canDisarmForStaff(claim)).toBe(true);
  });

  it("leaves a live draft alone — deleting it strands the customer", async () => {
    const r = new MemoryRepository();
    const draft = await r.createAnonymousClaim({
      firstName: "Terri",
      lastName: "Osborne",
      deliveryZip: "28105",
    });
    expect(draft.claimNumber).toBeNull();
    expect(canDisarmForStaff(draft)).toBe(false);
  });

  it("has nothing to disarm when the cookie names a claim that is gone", () => {
    expect(canDisarmForStaff(null)).toBe(false);
    expect(canDisarmForStaff(undefined)).toBe(false);
  });
});

describe("claimantHasAccount — who the confirmation screen recognises", () => {
  const HOUR = 3_600_000;

  /** A repository that says yes to everyone, so only the GATES are on trial. */
  function repoSayingYes(seen: string[] = []): {
    accountExistsForEmail: (email: string) => Promise<boolean>;
    asked: string[];
  } {
    return {
      asked: seen,
      accountExistsForEmail: async (email: string) => {
        seen.push(email);
        return true;
      },
    };
  }

  function submitted(overrides: Partial<Claim> = {}): Claim {
    return {
      ...({} as Claim),
      id: "claim-1",
      status: "submitted",
      contactEmail: "terri@rapqa.com",
      submittedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("recognises a submitted claim whose email has an account", async () => {
    const repo = repoSayingYes();
    expect(
      await claimantHasAccount(repo as never, submitted(), { authConfigured: true })
    ).toBe(true);
    expect(repo.asked).toEqual(["terri@rapqa.com"]);
  });

  it("never asks when there is no auth to have an account in", async () => {
    // Same fail-closed shape as the rest of lib/auth: no Supabase, no accounts,
    // and claimInvitation renders nothing at all in that configuration anyway.
    const repo = repoSayingYes();
    expect(
      await claimantHasAccount(repo as never, submitted(), { authConfigured: false })
    ).toBe(false);
    expect(repo.asked).toEqual([]);
  });

  it("never asks about a draft", async () => {
    const repo = repoSayingYes();
    expect(
      await claimantHasAccount(repo as never, submitted({ status: "draft" }), {
        authConfigured: true,
      })
    ).toBe(false);
    expect(repo.asked).toEqual([]);
  });

  it("never asks when the claim carries no email", async () => {
    const repo = repoSayingYes();
    for (const contactEmail of [null, "", "   "]) {
      expect(
        await claimantHasAccount(repo as never, submitted({ contactEmail }), {
          authConfigured: true,
        })
      ).toBe(false);
    }
    expect(repo.asked).toEqual([]);
  });

  it("stops recognising once the attach window has closed", async () => {
    // THE POINT OF THIS GATE. The claimant cookie lives seven days and /claim
    // re-renders the confirmation screen for all of them, but attachIntakeClaim
    // only attaches within ATTACH_WINDOW_HOURS. Past that, inviting them to log
    // in "to track this request" invites them to a screen that will not have it.
    const repo = repoSayingYes();
    const now = new Date();
    const inside = new Date(now.getTime() - (ATTACH_WINDOW_HOURS - 1) * HOUR);
    const outside = new Date(now.getTime() - (ATTACH_WINDOW_HOURS + 1) * HOUR);

    expect(
      await claimantHasAccount(repo as never, submitted({ submittedAt: inside.toISOString() }), {
        authConfigured: true,
        now,
      })
    ).toBe(true);

    expect(
      await claimantHasAccount(repo as never, submitted({ submittedAt: outside.toISOString() }), {
        authConfigured: true,
        now,
      })
    ).toBe(false);
  });

  it("says no rather than throwing when the lookup fails", async () => {
    // This runs while the screen holding the CG number renders. A courtesy must
    // never be the reason somebody who has already filed cannot read it.
    const repo = {
      accountExistsForEmail: async () => {
        throw new Error("PostgREST is having a day");
      },
    };
    expect(
      await claimantHasAccount(repo as never, submitted(), { authConfigured: true })
    ).toBe(false);
  });
});
