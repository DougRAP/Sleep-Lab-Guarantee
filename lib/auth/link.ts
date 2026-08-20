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
import type { Claim, LinkVia, Role } from "../types";
import { isStaff } from "./routing";

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

/* -------------------------------------------------------------------------- */
/* R-4 — the account picks up the request it was made for                     */
/* -------------------------------------------------------------------------- */

/** Hours after submission during which a sign-in may still adopt the request. */
export const ATTACH_WINDOW_HOURS = 48;

export interface AttachIntakeInput {
  /** From the claimant cookie (lib/claim-session.ts), never from a URL. */
  claimId: string;
  /** The authenticating account's email. The second factor; see below. */
  email: string | null;
  /** Staff never own a customer's request, even holding the cookie. */
  role: Role | null;
  now?: Date;
}

/**
 * Attach the request this browser filed to the account that just signed in,
 * sparing the customer a second form minutes after the first.
 *
 * TWO things must hold, and only one of them is this function's business.
 *
 * The claimant cookie proves a BROWSER opened this claim; it does not prove a
 * person. It is a seven-day bearer token that nothing invalidates, so on a
 * family tablet or a dealer's showroom device the next person to sign in would
 * inherit a stranger's request, silently and with no way back: linkClaimToUser
 * refuses to move an owned claim, and the app has no unlink anywhere, so a
 * wrong assignment is permanent and only a hand-written UPDATE undoes it.
 *
 * So the caller must be signInAction and nothing else. A password proves an
 * account that already existed under that address; creating one proves nothing,
 * because email confirmation is off (see lib/actions/auth.ts) and no mail
 * sender exists in this app at all, so signUp hands back a live session for any
 * string you type. Under sign-up the check below would ask only "does whoever
 * is holding this browser know the address that was typed into it", and the
 * people who know it are precisely the household and the showroom staff this
 * guard exists to stop.
 *
 * On top of that account, the address must match the one given at intake, so a
 * shared browser does not hand the request to whoever signs in next. Be honest
 * about what that second check is: with confirmation off it is knowledge of a
 * string, not possession of a mailbox. It closes the ordinary case (the next
 * person signs in with their own account) and no more. If email confirmation is
 * ever switched on, it becomes a real possession factor and sign-up can call
 * this too. A claim filed with only a mobile number falls to the manual form on
 * /requests, which is what that form is for.
 *
 * THE PURCHASE IS NOT PART OF THIS. An earlier cut co-linked the claim's
 * auto-matched guarantee, mirroring linkAccount. Owning a filed request is
 * small and mostly recoverable; owning a purchase unlocks the customer's name,
 * phone, email and home address on the RA document, and the ability to start an
 * exchange against it — and the match that assigned it is itself a heuristic on
 * ZIP and surname. A purchase is asserted by the customer at the link step, not
 * granted as a side effect of signing in.
 *
 * NOT a draft: a draft is not a filed request, and /requests renders a draft
 * row that links back into the fitting, which is the wrong destination for a v3
 * anonymous draft. Every other status attaches, including a denied or withdrawn
 * one — a customer is entitled to see how it ended.
 *
 * It never throws and never reports. A login must not fail because a courtesy
 * did not land.
 */
export async function attachIntakeClaim(
  repo: GuaranteeRepository,
  userId: string,
  input: AttachIntakeInput
): Promise<Claim | null> {
  const uid = (userId ?? "").trim();
  const claimId = (input.claimId ?? "").trim();
  if (!uid || !claimId) return null;
  if (isStaff(input.role)) return null;

  const claim = await repo.getClaimById(claimId);
  if (!claim || claim.status === "draft") return null;
  if (claim.consumerId && claim.consumerId !== uid) return null;
  if (!sameEmail(claim.contactEmail, input.email)) return null;
  if (!withinAttachWindow(claim.submittedAt, input.now ?? new Date())) return null;

  return repo.linkClaimToUser(claim.id, uid);
}

/**
 * May a staff sign-in delete the claimant cookie sitting on this browser?
 *
 * An agent's machine should not carry a customer's claim around for the rest of
 * the week, so the instinct is to always disarm. That instinct destroys data.
 * A submitted claim has a CG number the customer is holding, so the cookie is a
 * convenience and losing it costs a retype. A live DRAFT has no number, no
 * owner and no other handle of any kind: the cookie is the only thing in the
 * world that names it. Delete it and the customer standing at the showroom
 * tablet comes back to a blank form, and the row they half filled becomes an
 * orphan in the dashboard.
 *
 * So: disarm a filed request, leave a draft alone. Nothing to disarm if the
 * cookie names a claim that no longer exists.
 */
export function canDisarmForStaff(claim: Claim | null | undefined): boolean {
  return Boolean(claim) && claim!.status !== "draft";
}

/** Both present and equal, ignoring case and surrounding space. */
function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim().toLowerCase();
  const right = (b ?? "").trim().toLowerCase();
  return left.length > 0 && left === right;
}

/**
 * Measured from the SUBMISSION, not from the cookie.
 *
 * The cookie's own seven days start when the draft opens and are never
 * refreshed, so a customer who spent six days hunting for the law tag would get
 * a one-day courtesy while a stranger on a shared device kept the full week.
 * The window was anchored backwards relative to its own justification.
 */
function withinAttachWindow(submittedAt: string | null | undefined, now: Date): boolean {
  if (!submittedAt) return false;
  const at = new Date(submittedAt).getTime();
  if (!Number.isFinite(at)) return false;
  // A minute of slack on the near side. Today both backends stamp submittedAt
  // with the app's own clock, so age is never negative; if submitted_at ever
  // falls back to the column default, a Postgres clock a few seconds ahead
  // would silently switch this courtesy off for everybody, with no error.
  const age = now.getTime() - at;
  return age >= -60_000 && age <= ATTACH_WINDOW_HOURS * 3_600_000;
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
