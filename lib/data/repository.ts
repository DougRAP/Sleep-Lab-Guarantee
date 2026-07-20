// lib/data/repository.ts
// The data seam. UI and server code call this interface — never Supabase
// directly. Backed by Supabase when NEXT_PUBLIC_SUPABASE_URL is set, otherwise
// by the in-memory seed (see ./index).

import type {
  CheckIn,
  Claim,
  ClaimItem,
  ClaimPhoto,
  ClaimStatus,
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

/** The result of submitting — the RA is the dealer-facing view of the claim. */
export interface SubmitClaimResult {
  claim: Claim;
  raNumber: string;
  trackingNumber: string;
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
 */
export interface ClaimRecord {
  claimId: string;
  raNumber: string | null;
  trackingNumber: string | null;
  status: ClaimStatus;
  customerName: string;
  salesOrderNumber: string;
  dealerLocationId: string | null;
  /** Journey day at the time of the read (delivery date = day 0). */
  day: number;
  submittedAt: string | null;
  updatedAt: string | null;
}

/** Build an admin row from a claim + its guarantee. Shared by both backends. */
export function toClaimRecord(
  claim: Claim,
  guarantee: Guarantee,
  referenceDate: Date = new Date()
): ClaimRecord {
  const name = [guarantee.customerFirstName, guarantee.customerLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    claimId: claim.id,
    raNumber: claim.raNumber ?? null,
    trackingNumber: claim.trackingNumber ?? null,
    status: claim.status,
    customerName: name || guarantee.customerLastName,
    salesOrderNumber: guarantee.salesOrderNumber,
    dealerLocationId: guarantee.dealerLocationId ?? null,
    day: journeyDay(guarantee.deliveryDate, referenceDate),
    submittedAt: claim.submittedAt ?? null,
    updatedAt: claim.updatedAt ?? null,
  };
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
   * Finalize: generate the RA + tracking number and move the claim to
   * `submitted`. Idempotent — re-submitting returns the existing numbers.
   */
  submitClaim(claimId: string): Promise<SubmitClaimResult>;

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
   * linked a purchase yet (which routes them to the link step).
   */
  getGuaranteeForUser(userId: string): Promise<Guarantee | null>;
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
  /** Read-only list for the thin admin/dealer surface. Drafts are excluded. */
  listClaimRecords(scope: ClaimRecordScope): Promise<ClaimRecord[]>;

  // --- M3: AI concierge threads/messages (PRD §6) ---
  getOrCreateConciergeThread(guaranteeId: string): Promise<ConciergeThread>;
  listConciergeMessages(threadId: string): Promise<ConciergeMessage[]>;
  addConciergeMessage(
    threadId: string,
    role: ConciergeRole,
    body: string
  ): Promise<ConciergeMessage>;
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
