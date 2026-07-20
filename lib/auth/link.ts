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

import type { GuaranteeRepository } from "../data/repository";
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
