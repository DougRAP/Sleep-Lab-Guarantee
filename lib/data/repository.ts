// lib/data/repository.ts
// The data seam. UI and server code call this interface — never Supabase
// directly. Backed by Supabase when NEXT_PUBLIC_SUPABASE_URL is set, otherwise
// by the in-memory seed (see ./index).

import type {
  CheckIn,
  Claim,
  ClaimItem,
  ClaimLink,
  ClaimLinkKind,
  ClaimNote,
  ClaimNoteAuthor,
  ClaimPhoto,
  ClaimStatus,
  EarlyPreference,
  ConciergeMessage,
  ConciergeRole,
  ConciergeThread,
  ConfirmationKey,
  Coupon,
  DealerLocation,
  Feeling,
  FittingStep,
  Guarantee,
  InitialImpression,
  InitialImpressionRecord,
  Journey,
  LinkVia,
  PhoneKind,
  PhotoAngle,
  Tip,
} from "../types";
import type { TipQuery } from "../tips";
import { journeyDay } from "../eligibility";
import { CLAIM_NUMBER_PREFIX, CODE_ALPHABET } from "../ra";

/** Verify inputs for the two entry paths (PRD §3.1). */
export type VerifyInput =
  | { mode: "lookup"; salesOrderNumber: string; lastName: string }
  | { mode: "token"; token: string; lastName: string; deliveryDate: string };

/** Payload for persisting a nightly check-in (PRD §2a). */
export interface SaveCheckInInput {
  guaranteeId: string;
  feeling: Feeling;
  note?: string | null;
}

/** Payload for the one-time out-of-the-box first impression (day 0–1). */
export interface SaveInitialImpressionInput {
  guaranteeId: string;
  impression: InitialImpression;
  note?: string | null;
}

/** Payload for a quietly-recorded concierge concern (optional tool). */
export interface SaveConcernInput {
  guaranteeId: string;
  body: string;
}

/* -------------------------------------------------------------------------- */
/* M5 — the fitting (exchange request)                                        */
/* -------------------------------------------------------------------------- */

/** Opening a draft. `preVerified` drives the receipt-photo rule. */
export interface CreateDraftClaimInput {
  guaranteeId: string;
  /** True when the order arrived pre-verified (dashboard/CRM token link). */
  preVerified: boolean;
}

/** Everything the fitting can patch onto a draft, one step at a time. */
export interface UpdateClaimInput {
  step?: FittingStep;
  reasonExperience?: string | null;
  preferredReplacement?: string | null;
  confirmations?: ConfirmationKey[];
  contactPhone?: string | null;
  contactPhoneKind?: PhoneKind | null;
  contactEmail?: string | null;
  atDeliveryAddress?: boolean | null;
  newAddress?: string | null;
  stillOwns?: boolean | null;
  // --- v3 anonymous intake: purchase details + the protector checkbox ---
  salesOrderNumber?: string | null;
  modelNumber?: string | null;
  /** ISO date (YYYY-MM-DD), self-reported. */
  purchaseDate?: string | null;
  /** ISO date (YYYY-MM-DD), self-reported. */
  deliveryDate?: string | null;
  /** Informational — never gates submission. */
  protectorUsed?: boolean | null;
  /**
   * The before-day-31 choice, collected at the details step (spec §2.4) so it
   * survives leaving and resuming; submit normalizes it (null when in-window).
   */
  earlyPreference?: EarlyPreference | null;
}

/**
 * v3: opening an anonymous claim (spec §2.2) — no account, no guarantee link.
 * The three identity fields double as the auto-match key later.
 */
export interface CreateAnonymousClaimInput {
  firstName: string;
  lastName: string;
  /**
   * Optional since §2 merged identify+contact (2026-08-18): the entry form
   * takes a sales order number OR a delivery ZIP — either one identifies.
   */
  deliveryZip?: string | null;
}

/** Options carried into submit. v3: the before-day-31 choice, when made. */
export interface SubmitClaimOptions {
  earlyPreference?: EarlyPreference | null;
}

/** One mattress on the request (max 2). Replaces the stored set wholesale. */
export interface ClaimItemInput {
  modelNumber: string;
  notSoiled: boolean;
  noOdors: boolean;
  notDamaged: boolean;
}

/** A recorded capture. `storagePath` is null in the no-storage fallback. */
export interface RecordClaimPhotoInput {
  claimId: string;
  angle: PhotoAngle;
  label: string;
  storagePath?: string | null;
  fileName?: string | null;
}

/**
 * The result of submitting. v3: the claim number is the single customer
 * reference — RA and tracking numbers are NO LONGER minted at submit (RA
 * issuance became a manual admin action). Both stay on the result, null on new
 * claims, so rows minted under the old rule still round-trip.
 */
export interface SubmitClaimResult {
  claim: Claim;
  claimNumber: string;
  raNumber: string | null;
  trackingNumber: string | null;
}

/* -------------------------------------------------------------------------- */
/* M6 — real auth: the user <-> guarantee link and the thin admin read        */
/* -------------------------------------------------------------------------- */

/** Who is asking for the claim list. Dealers only ever see their own location. */
export type ClaimRecordScope =
  | { kind: "all" }
  | { kind: "dealer_location"; dealerLocationId: string };

/**
 * One row of the read-only admin/dealer list. Deliberately flat and small — the
 * locked decision is "data seam now, thin admin later", so this is a list, not
 * a ticketing surface. No approve/deny, no stats.
 *
 * v3 (M-S4): unlinked (anonymous) claims are first-class — identity fields fall
 * back to the claim's own self-reported columns when there is no guarantee.
 */
export interface ClaimRecord {
  claimId: string;
  /** Null on an UNLINKED anonymous claim — render from the claim's own fields. */
  guaranteeId: string | null;
  /** v3: `CG######` — the single customer reference. */
  claimNumber: string | null;
  /** RAP production claim number, written back by their integration. */
  ttcClaim: string | null;
  raNumber: string | null;
  trackingNumber: string | null;
  status: ClaimStatus;
  customerName: string;
  salesOrderNumber: string | null;
  /**
   * The claim's EFFECTIVE dealer location: the claim's own column when set
   * (anonymous claims), else the guarantee's. Dealer scoping keys off this.
   */
  dealerLocationId: string | null;
  /** Delivery ZIP — the guarantee's on linked claims, self-reported otherwise. */
  deliveryZip: string | null;
  /**
   * Journey day at the time of the read (delivery date = day 0). Null when no
   * delivery date is known (an anonymous claim that never reported one).
   */
  day: number | null;
  /** v3: the before-day-31 choice, when one was made. */
  earlyPreference: EarlyPreference | null;
  /** v3: snapshot taken at submit from the self-reported delivery date. */
  daysInServiceAtSubmit: number | null;
  /** v3: informational protector checkbox. */
  protectorUsed: boolean | null;
  submittedAt: string | null;
  updatedAt: string | null;
}

/**
 * Build an admin row from a claim + its guarantee — or from the claim alone
 * when it is unlinked (guarantee null). Shared by both backends.
 */
export function toClaimRecord(
  claim: Claim,
  guarantee: Guarantee | null,
  referenceDate: Date = new Date()
): ClaimRecord {
  // Linked claims keep sourcing identity from the guarantee (the registered
  // record outranks self-reported fields); unlinked claims are their own source.
  const firstName = guarantee ? guarantee.customerFirstName : claim.firstName;
  const lastName = guarantee ? guarantee.customerLastName : claim.lastName;
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  const deliveryDate = guarantee ? guarantee.deliveryDate : claim.deliveryDate ?? null;
  return {
    claimId: claim.id,
    guaranteeId: claim.guaranteeId ?? null,
    claimNumber: claim.claimNumber ?? null,
    ttcClaim: claim.ttcClaim ?? null,
    raNumber: claim.raNumber ?? null,
    trackingNumber: claim.trackingNumber ?? null,
    status: claim.status,
    customerName: name || "—",
    salesOrderNumber: guarantee
      ? guarantee.salesOrderNumber
      : claim.salesOrderNumber ?? null,
    // The claim's own column wins when set (the anonymous default scope);
    // otherwise the guarantee's — "own column, else via guarantee".
    dealerLocationId:
      claim.dealerLocationId ?? guarantee?.dealerLocationId ?? null,
    deliveryZip: guarantee
      ? guarantee.customerZip ?? null
      : claim.deliveryZip ?? null,
    day: deliveryDate ? journeyDay(deliveryDate, referenceDate) : null,
    earlyPreference: claim.earlyPreference ?? null,
    daysInServiceAtSubmit: claim.daysInServiceAtSubmit ?? null,
    protectorUsed: claim.protectorUsed ?? null,
    submittedAt: claim.submittedAt ?? null,
    updatedAt: claim.updatedAt ?? null,
  };
}

/**
 * The staff-search semantics, shared by both backends so they agree on what a
 * query means (the Supabase backend approximates the same rules with ilike):
 *   - sales order number: exact-ish (trimmed, case-insensitive) — no partials,
 *     so a fragment of one order never surfaces another
 *   - guarantee number: exact-ish, same rule
 *   - last name: the existing lastNameMatches rule ("Denise Calloway" finds
 *     the record whose last name is Calloway)
 *   - customer name: case-insensitive substring of "First Last"
 *   - email: exact-ish (trimmed, case-insensitive) — Emmy 2026-07-23
 *   - phone: full-number match on digits only, so "(704) 555-0214" finds
 *     7045550214; a short digit fragment is not a phone — Emmy 2026-07-23
 *   - zip: an exactly-5-digit query matches customer_zip (Doug 2026-07-23:
 *     "ZIP for admin/store records search"); empty until the bulk import
 *     fills the address columns, so it simply finds nothing before then
 *   - claim number (v3): exact-ish against the claim's `CG######`, case-
 *     insensitive, with or without the CG prefix — pass the claim to enable it
 * v3 (M-S4): `guarantee` may be null — an UNLINKED anonymous claim matches on
 * its own self-reported fields instead (name, ZIP, sales order #, contact).
 * Linked claims keep matching on the guarantee (the registered record).
 * An empty/blank query matches everything (the unfiltered list).
 */
export function claimSearchMatches(
  query: string,
  guarantee: Guarantee | null,
  claim?: Pick<
    Claim,
    | "claimNumber"
    | "firstName"
    | "lastName"
    | "deliveryZip"
    | "salesOrderNumber"
    | "contactEmail"
    | "contactPhone"
  >
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const asClaimNumber = claimNumberQuery(query);
  if (
    asClaimNumber &&
    (claim?.claimNumber ?? "").trim().toUpperCase() === asClaimNumber
  ) {
    return true;
  }
  // One set of fields to match on: the guarantee's when linked, the claim's
  // self-reported ones when not — the same precedence toClaimRecord renders.
  const salesOrderNumber = guarantee
    ? guarantee.salesOrderNumber
    : claim?.salesOrderNumber ?? "";
  const email = guarantee ? guarantee.customerEmail : claim?.contactEmail;
  const zip = guarantee ? guarantee.customerZip : claim?.deliveryZip;
  const phone = guarantee ? guarantee.customerPhone : claim?.contactPhone;
  const firstName = guarantee ? guarantee.customerFirstName : claim?.firstName;
  const lastName = guarantee ? guarantee.customerLastName : claim?.lastName;

  if (salesOrderNumber.trim().toLowerCase() === q) return true;
  if ((guarantee?.guaranteeNumber ?? "").trim().toLowerCase() === q) return true;
  if ((email ?? "").trim().toLowerCase() === q) return true;
  if (zipQuery(q) && (zip ?? "").trim() === q) return true;
  const digits = phoneDigits(q);
  if (digits && digits === phoneDigits(phone ?? "")) return true;
  if (lastName && lastNameMatches(query, lastName)) return true;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").toLowerCase();
  return Boolean(fullName) && fullName.includes(q);
}

/**
 * A query reads as a phone number when it strips to at least 7 digits (the
 * shortest dialable number). Returns the digits, or null when it isn't one.
 */
export function phoneDigits(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

/** A query reads as a US ZIP when it is exactly five digits. */
export function zipQuery(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

const CLAIM_NUMBER_BODY_RE = new RegExp(`^[${CODE_ALPHABET}]{6}$`);

/**
 * Canonicalize a claim-number-ish value to `CG######`, or null when it doesn't
 * read as one. Case-insensitive; the CG prefix is optional — both backends and
 * getClaimByNumber share this rule so "cg7mkq42" and "7MKQ42" find the same
 * claim.
 */
export function claimNumberQuery(value: string): string | null {
  const raw = value.trim().toUpperCase();
  const body = raw.startsWith(CLAIM_NUMBER_PREFIX)
    ? raw.slice(CLAIM_NUMBER_PREFIX.length)
    : raw;
  return CLAIM_NUMBER_BODY_RE.test(body) ? `${CLAIM_NUMBER_PREFIX}${body}` : null;
}

/** The self-reported identity an anonymous claim carries into auto-match. */
export interface MatchGuaranteeInput {
  lastName: string;
  deliveryZip?: string | null;
  salesOrderNumber?: string | null;
}

/**
 * v3 auto-match (spec §3, updated 2026-08-18): two alternative keys, either of
 * which links when it lands on exactly ONE registered guarantee —
 *   1. sales order # + last name (tried first: the order number is unique)
 *   2. delivery ZIP + last name
 * All comparisons exact-ish (trimmed; names/orders case-insensitive). Pure and
 * conservative: an ambiguous key is not a confident match, and no-match never
 * blocks a claim (the RAP agent matches manually).
 */
export function matchGuarantee(
  guarantees: Guarantee[],
  input: MatchGuaranteeInput
): Guarantee | null {
  const lastName = input.lastName.trim().toLowerCase();
  if (!lastName) return null;
  const zip = (input.deliveryZip ?? "").trim();
  const salesOrder = (input.salesOrderNumber ?? "").trim().toLowerCase();
  const byName = guarantees.filter(
    (g) => g.customerLastName.trim().toLowerCase() === lastName
  );
  if (salesOrder) {
    const byOrder = byName.filter(
      (g) => g.salesOrderNumber.trim().toLowerCase() === salesOrder
    );
    if (byOrder.length === 1) return byOrder[0];
  }
  if (zip) {
    const byZip = byName.filter((g) => (g.customerZip ?? "").trim() === zip);
    if (byZip.length === 1) return byZip[0];
  }
  return null;
}

/** Most rows a staff search returns — plenty for a desk, never a dump. */
export const CLAIM_SEARCH_LIMIT = 50;

/**
 * Standard staff filters (review 2026-07-22: "the standard date range search
 * fields and status"). Dates are plain YYYY-MM-DD, inclusive, matched against
 * the day part of `submittedAt`.
 */
export interface ClaimRecordFilters {
  status?: ClaimStatus | null;
  submittedFrom?: string | null;
  submittedTo?: string | null;
}

/** Pure filter rule, shared by both backends so they agree. */
export function claimRecordFilterMatches(
  filters: ClaimRecordFilters | undefined,
  claim: Pick<Claim, "status" | "submittedAt">
): boolean {
  if (!filters) return true;
  if (filters.status && claim.status !== filters.status) return false;
  const day = (claim.submittedAt ?? "").slice(0, 10);
  if (filters.submittedFrom && (!day || day < filters.submittedFrom)) return false;
  if (filters.submittedTo && (!day || day > filters.submittedTo)) return false;
  return true;
}

/**
 * Statuses from which the dealer may record the exchange sales order (their
 * ONE write besides notes, review 2026-07-22): only after RAP has authorized
 * the exchange, plus `completed` so a wrong number can be corrected.
 */
export const EXCHANGE_RECORDABLE_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  "approved",
  "dealer_scheduled",
  "completed",
]);

/** Shared guard for recording the exchange sales order. Throws on refusal. */
export function assertExchangeRecordable(
  current: ClaimStatus,
  salesOrderNumber: string
): void {
  if (!salesOrderNumber.trim()) {
    throw new Error("An exchange sales order number is required");
  }
  if (!EXCHANGE_RECORDABLE_STATUSES.has(current)) {
    throw new Error(`Cannot record an exchange on a ${current} claim`);
  }
}

/** One row's activity timestamps — all `byMostRecent` needs to sort. */
interface Timestamped {
  updatedAt?: string | null;
  submittedAt?: string | null;
}

/**
 * Newest activity first. Structural on purpose: the admin sorts `ClaimRecord`s
 * and the consumer's own list sorts `Claim`s, and the two must agree on what
 * "most recent" means.
 */
export function byMostRecent(a: Timestamped, b: Timestamped): number {
  const at = a.updatedAt ?? a.submittedAt ?? "";
  const bt = b.updatedAt ?? b.submittedAt ?? "";
  return bt.localeCompare(at);
}

/**
 * Statuses where a request's story is normally over (PRD §4). Still used for
 * display semantics, but since the 2026-07-22 review they no longer lock the
 * claim: only rap_admin can adjudicate, and Doug wants admin able to reopen a
 * declined/completed request to make an accommodation.
 */
export const TERMINAL_CLAIM_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  "completed",
  "denied",
  "expired",
  "withdrawn",
]);

/**
 * The status-transition guard, shared by both backends so they refuse the same
 * moves. One hard rule remains: nothing ever returns to `draft` (a draft is an
 * in-progress fitting, not an adjudication state). Terminal statuses are open
 * to adjudication again (review 2026-07-22: "we shouldn't lock that in case
 * you want to make an accommodation") — the ROLE gate stays in the staff
 * action: dealers never adjudicate at all.
 *
 * v3 adds `inspection_scheduled` (a tech visit) with its own narrow edges:
 * entered only from `in_review`, and exits only to `approved`, `denied`, or
 * back to `in_review` (the visit fell through). The general permissiveness
 * above stays for every other status.
 */
export function assertClaimStatusTransition(
  current: ClaimStatus,
  next: ClaimStatus
): void {
  if (next === "draft") {
    throw new Error(`Cannot move a claim back to draft`);
  }
  if (next === "inspection_scheduled" && current !== "in_review") {
    throw new Error(
      `Cannot schedule an inspection on a ${current} claim (review it first)`
    );
  }
  if (
    current === "inspection_scheduled" &&
    !["approved", "denied", "in_review"].includes(next)
  ) {
    throw new Error(`Cannot move an inspection_scheduled claim to ${next}`);
  }
}

/**
 * Every status adjudication can set (draft is a fitting state, never a target).
 * The staff status control and the action's allow-list both read this.
 */
export const ADJUDICATION_STATUSES: readonly ClaimStatus[] = [
  "submitted",
  "in_review",
  "inspection_scheduled",
  "approved",
  "dealer_scheduled",
  "completed",
  "denied",
  "expired",
  "withdrawn",
];

/**
 * The moves `assertClaimStatusTransition` would permit from `current` — derived
 * by asking the guard itself, so the UI's offer can never drift from the rule.
 * Terminal statuses return [] (the request's story is over).
 */
export function permittedClaimStatusTransitions(current: ClaimStatus): ClaimStatus[] {
  return ADJUDICATION_STATUSES.filter((next) => {
    if (next === current) return false;
    try {
      assertClaimStatusTransition(current, next);
      return true;
    } catch {
      return false;
    }
  });
}

/** A staff note being added. `author` is the SERVER-resolved role, never form data. */
export interface AddClaimNoteInput {
  author: ClaimNoteAuthor;
  body: string;
  /** The real auth user id when one exists; null on the demo fallback. */
  authorId?: string | null;
}

/**
 * A document link being attached by staff (v3 §4). Same trust posture as
 * AddClaimNoteInput: identity comes from the server-resolved staff view, never
 * from a form.
 */
export interface AddClaimLinkInput {
  kind: ClaimLinkKind;
  url: string;
  label?: string | null;
  /** The real staff auth user id when one exists; null on the demo fallback. */
  createdBy?: string | null;
}

export interface GuaranteeRepository {
  getGuaranteeById(id: string): Promise<Guarantee | null>;
  getGuaranteeBySalesOrder(salesOrderNumber: string): Promise<Guarantee | null>;
  getGuaranteeByToken(token: string): Promise<Guarantee | null>;
  /** Light identity verify. Returns the guarantee on success, null on any mismatch. */
  verifyGuarantee(input: VerifyInput): Promise<Guarantee | null>;
  /** Journey snapshot (day + phase) computed from the delivery date. */
  getJourney(guaranteeId: string, referenceDate?: Date): Promise<Journey | null>;
  /** True if a prior comfort exchange is approved/completed (one-time rule). */
  hasResolvedExchange(guaranteeId: string): Promise<boolean>;
  listTips(): Promise<Tip[]>;

  // --- M4: dealer locations (dealer triage #4 + shop coupon #6) ---
  /** A dealer location by its text id, or null if none. */
  getDealerLocationById(id: string): Promise<DealerLocation | null>;
  /**
   * The dealer location for a guarantee, resolved via its `dealerLocationId`.
   * Returns null when the guarantee has no location or no matching row (fallback).
   */
  getDealerLocationForGuarantee(guaranteeId: string): Promise<DealerLocation | null>;

  // --- M3: check-in persistence (PRD §2a) ---
  /** Today's check-in for this guarantee, or null if none logged yet. */
  getTodayCheckIn(guaranteeId: string, referenceDate?: Date): Promise<CheckIn | null>;
  /** Persist tonight's check-in. Idempotent per day — re-logging updates today's entry. */
  saveCheckIn(input: SaveCheckInInput, referenceDate?: Date): Promise<CheckIn>;

  // --- Initial impression (one-time, day 0–1) ---
  /** The recorded first impression for this guarantee, or null if none yet. */
  getInitialImpression(guaranteeId: string): Promise<InitialImpressionRecord | null>;
  /** Persist the one-time first impression. Idempotent — re-recording updates it. */
  saveInitialImpression(input: SaveInitialImpressionInput): Promise<InitialImpressionRecord>;

  // --- Concierge concerns (optional, from chat tool-use) ---
  /** Quietly record a concern raised in the concierge chat (session-scoped). */
  saveConcern(input: SaveConcernInput): Promise<void>;

  // --- M3: tunable tips (PRD §2a) ---
  /** Select the best on-brand tip for the current journey day + phase (+ time-of-day). */
  getTip(query: TipQuery): Promise<Tip | null>;

  // --- M5: the fitting (draft → submitted exchange request) ---
  /** The resumable in-progress request for this guarantee, or null. */
  getDraftClaim(guaranteeId: string): Promise<Claim | null>;
  /** Open a draft. Idempotent — returns the existing draft when one is open. */
  createDraftClaim(input: CreateDraftClaimInput): Promise<Claim>;
  getClaimById(claimId: string): Promise<Claim | null>;
  /**
   * Every claim for one guarantee, newest first. Includes drafts — the
   * consumer's own in-progress request is a thing they should see.
   *
   * Deliberately NOT the same read as `listClaimRecords`: that one is the
   * admin/dealer view (no per-guarantee scope, drafts excluded). Consumer and
   * staff reads have different rules and must not share a code path.
   */
  listClaimsForGuarantee(guaranteeId: string): Promise<Claim[]>;
  /** Patch a draft after a step. Unspecified fields are left untouched. */
  updateClaim(claimId: string, patch: UpdateClaimInput): Promise<Claim>;
  listClaimItems(claimId: string): Promise<ClaimItem[]>;
  /** Replace the request's items wholesale (max 2 are kept). */
  saveClaimItems(claimId: string, items: ClaimItemInput[]): Promise<ClaimItem[]>;
  listClaimPhotos(claimId: string): Promise<ClaimPhoto[]>;
  /** Record a capture. Re-capturing the same angle replaces the row (retake). */
  recordClaimPhoto(input: RecordClaimPhotoInput): Promise<ClaimPhoto>;
  /**
   * Finalize: mint the `CG######` claim number and move the claim to
   * `submitted` (v3 — RA/tracking numbers are no longer minted here).
   * Also snapshots `daysInServiceAtSubmit` from the self-reported delivery
   * date when present, stores the optional early-window preference, and
   * attempts the guarantee auto-match on anonymous claims (never blocking).
   * Idempotent — re-submitting returns the existing claim number.
   */
  submitClaim(claimId: string, options?: SubmitClaimOptions): Promise<SubmitClaimResult>;

  // --- v3 (M-S1): anonymous claim-first intake ---
  /**
   * Open an anonymous draft claim (no account, no guarantee): identity fields
   * only, `guaranteeId` null, scoped to the default dealer location.
   */
  createAnonymousClaim(input: CreateAnonymousClaimInput): Promise<Claim>;
  /**
   * The claim a customer's `CG######` names, or null. Forgiving on input:
   * case-insensitive, CG prefix optional (see claimNumberQuery).
   */
  getClaimByNumber(claimNumber: string): Promise<Claim | null>;
  /**
   * Auto-match an anonymous claim to a registered guarantee — (sales order # +
   * last name) or (delivery ZIP + last name), see matchGuarantee — and link it
   * when the match is unique. NEVER throws on no-match: the claim is returned
   * unchanged and a RAP agent matches manually. No-op on linked claims.
   */
  linkClaimToGuaranteeIfMatched(claimId: string): Promise<Claim>;
  // --- v3 (M-S5): tracking + relaxed linking ---
  /**
   * Every claim linked to this auth user (claims.consumer_id), newest first —
   * the tracking list for an account, which works with ZERO guarantees.
   * Drafts included, same as listClaimsForGuarantee.
   */
  listClaimsForUser(userId: string): Promise<Claim[]>;
  /**
   * Attach a claim to an auth user (sets claims.consumer_id). Returns null
   * when the claim doesn't exist or already belongs to a DIFFERENT account —
   * a claim belongs to one account (mirrors linkGuaranteeToUser). Idempotent
   * for the same user.
   */
  linkClaimToUser(claimId: string, userId: string): Promise<Claim | null>;
  /**
   * The unique guarantee the two-key rule lands on — (sales order # + last
   * name) or (ZIP + last name), see matchGuarantee — or null (no match or
   * ambiguous). Read-only; the caller decides whether to link.
   */
  findGuaranteeForLink(input: MatchGuaranteeInput): Promise<Guarantee | null>;

  /** Every link attached to a claim, oldest first. */
  listClaimLinks(claimId: string): Promise<ClaimLink[]>;
  /**
   * Attach a document link (agent action, v3 §4). Mirrors addClaimNote's
   * posture: server-resolved identity, throws on an unknown claim id.
   */
  addClaimLink(claimId: string, input: AddClaimLinkInput): Promise<ClaimLink>;
  /**
   * Move a claim to a new status (adjudication seam) and let `updatedAt`
   * refresh. Guarded by `assertClaimStatusTransition`: no claim ever returns
   * to `draft`; terminal statuses reopen for admin accommodations (review
   * 2026-07-22). Throws on an unknown claim id or a refused transition.
   */
  updateClaimStatus(claimId: string, status: ClaimStatus): Promise<Claim>;
  /**
   * The dealer's one write: record the sales order number of the in-store
   * exchange (review 2026-07-22). Allowed only after RAP authorized the
   * exchange (approved/dealer_scheduled; completed for corrections) and moves
   * the claim to `completed`. Throws on refusal or an unknown claim id.
   */
  recordExchangeSalesOrder(claimId: string, salesOrderNumber: string): Promise<Claim>;

  // --- M5b: the shop coupon (issued on request, four-week expiry) ---
  /** The guarantee's current coupon, or null when there is none or it expired. */
  getActiveCoupon(guaranteeId: string): Promise<Coupon | null>;
  /**
   * Issue a coupon for this guarantee. Idempotent — an unexpired coupon is
   * returned as-is, never reissued, so the code a customer wrote down keeps
   * working. `pct` is snapshotted from the dealer's `couponPct` at issue time.
   */
  issueCoupon(guaranteeId: string): Promise<Coupon>;

  // --- M6: real auth — the user <-> guarantee link ---
  /**
   * The guarantee linked to this Supabase auth user, or null when they haven't
   * linked a purchase yet (which routes them to the link step). With multiple
   * purchases (B-28) this is the most recent — the default active one.
   */
  getGuaranteeForUser(userId: string): Promise<Guarantee | null>;
  /**
   * Every guarantee linked to this account, most recent first (B-28: an account
   * may hold several purchases). Empty when none are linked.
   */
  listGuaranteesForUser(userId: string): Promise<Guarantee[]>;
  /**
   * Link an authenticated user to a guarantee (sets `guarantees.consumer_id`).
   * Server-authoritative. Returns null when the guarantee doesn't exist or is
   * already linked to a different account — a purchase belongs to one account.
   */
  linkGuaranteeToUser(
    guaranteeId: string,
    userId: string,
    via: LinkVia
  ): Promise<Guarantee | null>;
  /**
   * Read-only list for the thin admin/dealer surface. Drafts are excluded.
   * `query` narrows by the shared `claimSearchMatches` semantics (order #,
   * guarantee #, last name, partial customer name); empty/absent = the full
   * list. The scope is applied inside the read, never by the caller's UI.
   */
  listClaimRecords(
    scope: ClaimRecordScope,
    query?: string,
    filters?: ClaimRecordFilters
  ): Promise<ClaimRecord[]>;
  /**
   * One request for the staff detail page. Scope-aware: a dealer asking about
   * a claim from another location gets null — indistinguishable from a claim
   * that doesn't exist, mirroring the consumer detail's ownership rule.
   * Drafts are null too (an in-progress fitting is not a request yet).
   */
  getClaimRecord(scope: ClaimRecordScope, claimId: string): Promise<ClaimRecord | null>;

  // --- Dealer desk: the claim-notes thread (dealer <-> RAP) ---
  /** Every note on a claim, oldest first. Callers apply the is_internal rule. */
  listClaimNotes(claimId: string): Promise<ClaimNote[]>;
  /**
   * Add a staff note. The author role is stamped from the resolved server-side
   * view (see AddClaimNoteInput) and the note is part of the shared
   * dealer <-> RAP thread, so it is stored non-internal. Throws on an unknown
   * claim id.
   */
  addClaimNote(claimId: string, input: AddClaimNoteInput): Promise<ClaimNote>;

  // --- M3: AI concierge threads/messages (PRD §6) ---
  getOrCreateConciergeThread(guaranteeId: string): Promise<ConciergeThread>;
  listConciergeMessages(threadId: string): Promise<ConciergeMessage[]>;
  addConciergeMessage(
    threadId: string,
    role: ConciergeRole,
    body: string
  ): Promise<ConciergeMessage>;

  // --- B-11: coach usage telemetry (privacy-adjusted 2026-07-24) ---
  /**
   * Persist one reply's summed token usage. Numbers + thread_id only — no
   * guarantee_id, no text (the privacy panel's design: the join to a person,
   * when ever needed, is a deliberate staff-side query via concierge_messages,
   * not a stored column). Must never throw into the caller's chat path.
   */
  recordConciergeUsage(input: ConciergeUsageInput): Promise<void>;
  /**
   * The per-day aggregate for the admin report, most recent day first,
   * covering the last `days` days (default 30). No identifiers of any kind.
   */
  listConciergeUsageDaily(days?: number): Promise<ConciergeUsageDay[]>;

  // --- B-13: tunable limits + rate limiting + chat quotas ---
  /**
   * All tunable-limit rows as a key→value map (B-13 Pieza 5). The caller pairs
   * this with resolveSetting(), so a missing table just yields code defaults.
   */
  getAppSettings(): Promise<Record<string, number>>;
  /**
   * Atomically increment the fixed-window counter for (bucket, key,
   * windowStart) and return the new value. Backs enforceRateLimit(); must be a
   * single atomic op so concurrent serverless instances can't undercount.
   */
  bumpRateCounter(bucket: string, key: string, windowStartIso: string): Promise<number>;
  /** Assistant replies sent to one guarantee since `sinceIso` (per-day quota). */
  countConciergeRepliesSince(guaranteeId: string, sinceIso: string): Promise<number>;
  /** Assistant replies sent program-wide since `sinceIso` (global fuse). */
  countConciergeRepliesGlobalSince(sinceIso: string): Promise<number>;
}

/** One reply's billed usage (every API round summed). Raw telemetry row. */
export interface ConciergeUsageInput {
  /** Nullable: the row must survive a thread/customer deletion, unlinked. */
  threadId: string | null;
  model: string;
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/** One report line: a calendar day's totals, identifier-free. */
export interface ConciergeUsageDay {
  /** YYYY-MM-DD (UTC, matching created_at::date in Postgres). */
  day: string;
  /** Assistant replies (rows). */
  replies: number;
  /** API round-trips (a tool-use reply makes several). */
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/** Case/whitespace-insensitive last-name match; tolerates a full name entered. */
export function lastNameMatches(entered: string, actualLast: string): boolean {
  const a = entered.trim().toLowerCase();
  const b = actualLast.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  // Accept "Andrew Demo" when the record's last name is "Demo".
  const lastToken = a.split(/\s+/).pop();
  return lastToken === b;
}

/** Compare two dates as calendar days (YYYY-MM-DD), ignoring time. */
export function sameCalendarDate(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

/** Local calendar date as YYYY-MM-DD. The "night" a check-in belongs to. */
export function todayIso(referenceDate: Date = new Date()): string {
  const y = referenceDate.getFullYear();
  const m = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const d = String(referenceDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
