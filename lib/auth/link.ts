// lib/auth/link.ts
// Linking a purchase to an authenticated account.
//
// This is NOT the login. It runs only for a user who has already proved who
// they are with an email + password, which is what makes it safe: guessing a
// sales order number grants nothing on its own — at worst it attaches someone
// else's purchase to an account you already had to create, and the
// already-linked guard below stops even that.
//
// Two ways in:
//   token  — arrived on the RAP dashboard link; the purchase is pre-associated
//            and links automatically (and stays "pre-verified" for the fitting).
//   lookup — the customer enters sales order number + last name.
//
// Pure with respect to Next: takes a repository, returns a result. Testable.

import {
  claimNumberQuery,
  lastNameMatches,
  type GuaranteeRepository,
} from "../data/repository";
import type { LinkVia } from "../types";

export type LinkInput =
  | { mode: "token"; token: string }
  | { mode: "lookup"; salesOrderNumber: string; lastName: string };

export type LinkResult =
  | { ok: true; guaranteeId: string; via: LinkVia }
  | { ok: false; error: string };

/** Calm, never-red copy (DESIGN.md): no alarm, no "invalid", no error codes. */
export const LINK_NO_MATCH =
  "We couldn't find a match with those details. Give them another look and try again.";
export const LINK_MISSING =
  "Enter your sales order number and last name so we can find your purchase.";
export const LINK_TAKEN =
  "That purchase is already linked to another account. Sign in with that email, or reach out and we'll sort it out.";
export const LINK_NO_ACCOUNT =
  "Let's get you signed in first, then we'll find your purchase.";

/**
 * Attach a guarantee to an authenticated user. Idempotent: re-linking the same
 * purchase to the same account succeeds and simply refreshes how it was linked.
 */
export async function linkPurchase(
  repo: GuaranteeRepository,
  userId: string,
  input: LinkInput
): Promise<LinkResult> {
  const uid = (userId ?? "").trim();
  if (!uid) return { ok: false, error: LINK_NO_ACCOUNT };

  const guarantee =
    input.mode === "token"
      ? await lookupByToken(repo, input.token)
      : await lookupByOrder(repo, input.salesOrderNumber, input.lastName);

  if (guarantee === "missing") return { ok: false, error: LINK_MISSING };
  if (!guarantee) return { ok: false, error: LINK_NO_MATCH };
  if (guarantee.consumerId && guarantee.consumerId !== uid) {
    return { ok: false, error: LINK_TAKEN };
  }

  const linked = await repo.linkGuaranteeToUser(guarantee.id, uid, input.mode);
  if (!linked) return { ok: false, error: LINK_TAKEN };
  return { ok: true, guaranteeId: linked.id, via: input.mode };
}

/* -------------------------------------------------------------------------- */
/* v3 (M-S5): the relaxed link step — order OR ZIP OR claim number            */
/* -------------------------------------------------------------------------- */

/** Calm copy for the relaxed step. Every miss offers the way through. */
export const LINK_NOT_FOUND =
  "We couldn't find it with those details. Give them another look and try again — or continue, and we'll connect it for you later.";
export const LINK_NEED_DETAILS =
  "Add your last name, plus a sales order number, delivery ZIP, or claim number — any one of them is fine.";
export const LINK_CLAIM_TAKEN =
  "That claim is already linked to another account. Sign in with that email, or reach out and we'll sort it out.";

export interface LinkAccountInput {
  /** Sales order number — or a claim number when it starts with CG. */
  identifier: string;
  deliveryZip: string;
  lastName: string;
}

export type LinkAccountResult =
  | { ok: true; kind: "guarantee"; guaranteeId: string }
  /** A claim was linked; guaranteeId is set when its guarantee co-linked. */
  | { ok: true; kind: "claim"; claimId: string; guaranteeId: string | null }
  | { ok: false; error: string; offerContinue: boolean };

/**
 * True when the identifier reads as a claim number. The CG prefix is REQUIRED
 * here (unlike getClaimByNumber's forgiving lookup): a bare 6-character sales
 * order like "234567" must never be mistaken for a claim number.
 */
export function isClaimIdentifier(identifier: string): boolean {
  return /^cg/i.test(identifier.trim()) && claimNumberQuery(identifier) !== null;
}

/**
 * The relaxed link step (Doug 2026-08-18): one form, three ways to identify —
 * sales order + last name, delivery ZIP + last name (matchGuarantee's two-key
 * rule, unique match only), or claim number + last name. A miss NEVER dead-ends:
 * `offerContinue` tells the form to show "Continue anyway" (signed in, nothing
 * linked — no fake rows). Pure with respect to Next; testable.
 */
export async function linkAccount(
  repo: GuaranteeRepository,
  userId: string,
  input: LinkAccountInput
): Promise<LinkAccountResult> {
  const uid = (userId ?? "").trim();
  if (!uid) return { ok: false, error: LINK_NO_ACCOUNT, offerContinue: false };

  const identifier = (input.identifier ?? "").trim();
  const deliveryZip = (input.deliveryZip ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  if (!lastName || (!identifier && !deliveryZip)) {
    return { ok: false, error: LINK_NEED_DETAILS, offerContinue: false };
  }

  // --- Claim number path (CG######) ---
  if (isClaimIdentifier(identifier)) {
    const claim = await repo.getClaimByNumber(identifier);
    // The claim's own last name (v3 anonymous), else its guarantee's (legacy).
    const claimLastName =
      claim?.lastName?.trim() ||
      (claim?.guaranteeId
        ? (await repo.getGuaranteeById(claim.guaranteeId))?.customerLastName
        : null);
    if (!claim || !claimLastName || !lastNameMatches(lastName, claimLastName)) {
      // Wrong number and wrong name are indistinguishable on purpose.
      return { ok: false, error: LINK_NOT_FOUND, offerContinue: true };
    }
    if (claim.consumerId && claim.consumerId !== uid) {
      return { ok: false, error: LINK_CLAIM_TAKEN, offerContinue: true };
    }
    const linked = await repo.linkClaimToUser(claim.id, uid);
    if (!linked) return { ok: false, error: LINK_CLAIM_TAKEN, offerContinue: true };
    // Co-link the claim's guarantee when it has one and it's free (or ours).
    let guaranteeId: string | null = null;
    if (linked.guaranteeId) {
      const g = await repo.linkGuaranteeToUser(linked.guaranteeId, uid, "lookup");
      guaranteeId = g?.id ?? null;
    }
    return { ok: true, kind: "claim", claimId: linked.id, guaranteeId };
  }

  // --- Purchase path: the two-key rule, unique match only ---
  const found = await repo.findGuaranteeForLink({
    lastName,
    salesOrderNumber: identifier || null,
    deliveryZip: deliveryZip || null,
  });
  if (!found) return { ok: false, error: LINK_NOT_FOUND, offerContinue: true };
  if (found.consumerId && found.consumerId !== uid) {
    return { ok: false, error: LINK_TAKEN, offerContinue: true };
  }
  const linked = await repo.linkGuaranteeToUser(found.id, uid, "lookup");
  if (!linked) return { ok: false, error: LINK_TAKEN, offerContinue: true };
  return { ok: true, kind: "guarantee", guaranteeId: linked.id };
}

async function lookupByToken(repo: GuaranteeRepository, token: string) {
  const value = (token ?? "").trim();
  if (!value) return null;
  return repo.getGuaranteeByToken(value);
}

async function lookupByOrder(
  repo: GuaranteeRepository,
  salesOrderNumber: string,
  lastName: string
) {
  const order = (salesOrderNumber ?? "").trim();
  const last = (lastName ?? "").trim();
  if (!order || !last) return "missing" as const;
  // Reuses the existing verify rule, so the last-name match stays consistent
  // with the light-verify fallback (case-insensitive, tolerates a full name).
  return repo.verifyGuarantee({ mode: "lookup", salesOrderNumber: order, lastName: last });
}
