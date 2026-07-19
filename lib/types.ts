// lib/types.ts
// Domain types for RAP Sleep Lab (M2). Mirrors supabase/schema.sql.
// TS uses camelCase; the repository layer maps to/from snake_case columns.

export type Role = "consumer" | "rap_admin" | "dealer";

/** The 90-night journey phase (see PRD §2a / §6). */
export type JourneyPhase = "settle_in" | "safety_net" | "expired" | "resolved";

/**
 * Comfort-exchange status machine (PRD §4). `draft` (M5) precedes `submitted` —
 * an in-progress fitting is persisted so the customer can leave and resume.
 */
export type ClaimStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "dealer_scheduled"
  | "completed"
  | "denied"
  | "expired"
  | "withdrawn";

/**
 * Photo targets. The first four are the original M2 set (kept for existing
 * rows); M5 adds the five uncovered mattress angles plus the receipt.
 */
export type PhotoAngle =
  | "law_tag"
  | "model_tag"
  | "overall"
  | "protector"
  | "foot"
  | "left_side"
  | "right_side"
  | "head"
  | "top_down"
  | "receipt";

/** One calm screen of the fitting. Persisted on the draft so we can resume. */
export type FittingStep =
  | "intake"
  | "items"
  | "confirmations"
  | "photos"
  | "verify"
  | "submitted";

/** The 90-Night terms the customer taps to confirm (all required). */
export type ConfirmationKey =
  | "clean_sanitary"
  | "law_tag_attached"
  | "model_tag_attached"
  | "like_new"
  | "both_partners_present"
  | "within_window"
  | "original_owner"
  | "in_possession_household"
  | "us_original_dealer";

/** How the customer prefers to be reached about the request. */
export type PhoneKind = "mobile" | "home" | "work";

export type Feeling = "better" | "same" | "rougher";

/** First out-of-the-box impression of a new mattress (one-time, days 0–1). */
export type InitialImpression = "firmer" | "just_right" | "softer";

export type TimeOfDay = "morning" | "day" | "evening" | "night" | "any";

export type PaymentKind = "restocking_fee" | "price_difference";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded";

export type ConciergeRole = "user" | "assistant" | "system";

/** A registration record, seeded from the CRM export. */
export interface Guarantee {
  id: string;
  salesOrderNumber: string;
  guaranteeNumber?: string | null;
  customerFirstName?: string | null;
  customerLastName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  dealerName?: string | null;
  /** Scopes dealer-role access via RLS. */
  dealerLocationId?: string | null;
  manufacturer?: string | null;
  oemModel?: string | null;
  productDescription?: string | null;
  purchasePrice?: number | null;
  /** ISO date (YYYY-MM-DD). Start date for the 90-night calculation. */
  deliveryDate: string;
  /** Path A pre-filled-link token (light identity verify). */
  accessToken?: string | null;
  createdAt?: string;
}

/** Per-guarantee journey snapshot (phase is computed from deliveryDate). */
export interface Journey {
  id: string;
  guaranteeId: string;
  startDate: string;
  currentDay: number;
  phase: JourneyPhase;
  /** One-time first impression, captured on day 0–1. Null until recorded. */
  initialImpression?: InitialImpression | null;
  initialImpressionNote?: string | null;
  /** ISO timestamp the first impression was recorded. */
  initialImpressionAt?: string | null;
  createdAt?: string;
}

/**
 * The one-time first impression of the mattress, out of the box. Stored on the
 * journey (Supabase) / a session-scoped store (memory). Separate from the
 * nightly check-in, which is per-day.
 */
export interface InitialImpressionRecord {
  guaranteeId: string;
  impression: InitialImpression;
  note?: string | null;
  /** ISO timestamp recorded. */
  at?: string | null;
}

export interface CheckIn {
  id: string;
  guaranteeId: string;
  date: string;
  feeling: Feeling;
  note?: string | null;
  createdAt?: string;
}

/** Tunable content layer (PRD §2a, §6). Seedable from a file. */
export interface Tip {
  id: string;
  dayMin: number | null;
  dayMax: number | null;
  phase: JourneyPhase | "any" | null;
  timeOfDay: TimeOfDay;
  title: string;
  body: string;
  active: boolean;
}

export interface Claim {
  id: string;
  guaranteeId: string;
  consumerId?: string | null;
  status: ClaimStatus;
  /** Return Authorization number — generated on submit, shared with the dealer. */
  raNumber?: string | null;
  /** Customer-facing tracking number for the request (M5). */
  trackingNumber?: string | null;
  /** Why they want to exchange, in their own words (structured intake). */
  reasonExperience?: string | null;
  /** What they'd rather have — the preferred replacement, in their own words. */
  preferredReplacement?: string | null;
  /** Which fitting screen to resume on. */
  step?: FittingStep;
  /** Tap-to-confirm terms the customer has affirmed. */
  confirmations?: ConfirmationKey[];
  /**
   * True when the sales order arrived pre-verified (dashboard/CRM token link).
   * Drives the receipt-photo rule: a receipt is only asked for when false.
   */
  preVerified?: boolean;
  contactPhone?: string | null;
  contactPhoneKind?: PhoneKind | null;
  contactEmail?: string | null;
  /** Null until asked; true = still at the delivery address. */
  atDeliveryAddress?: boolean | null;
  /** Captured only when the mattress has moved. */
  newAddress?: string | null;
  /** Confirms they still personally own the mattress. */
  stillOwns?: boolean | null;
  denialReason?: string | null;
  restockingFee?: number | null;
  priceDifference?: number | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** One mattress on the request. Max 2 per request (PRD). */
export interface ClaimItem {
  id: string;
  claimId: string;
  /** From the tag on the mattress or on the receipt. */
  modelNumber: string;
  notSoiled: boolean;
  noOdors: boolean;
  notDamaged: boolean;
  /** 0-based order on the request. */
  position: number;
  createdAt?: string;
}

export interface ClaimPhoto {
  id: string;
  claimId: string;
  angle: PhotoAngle;
  /**
   * Path in Supabase Storage. Null when storage isn't configured — the capture
   * is recorded as metadata only so the flow still completes (graceful degrade).
   */
  storagePath?: string | null;
  /** Human label shown in the flow and on the RA ("Law tag", "Foot", …). */
  label?: string | null;
  /** Original file name, when the browser provided one. */
  fileName?: string | null;
  /** True once the customer has captured this angle. */
  captured: boolean;
  capturedAt?: string | null;
  aiCoach?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface ClaimNote {
  id: string;
  claimId: string;
  authorId?: string | null;
  body: string;
  isInternal: boolean;
  createdAt?: string;
}

/** Payment seam only — Stripe wired by the dev team (PRD §2, §6). */
export interface Payment {
  id: string;
  claimId: string;
  kind: PaymentKind;
  amount: number;
  status: PaymentStatus;
  provider?: string | null;
  providerRef?: string | null;
  createdAt?: string;
}

export interface ConciergeThread {
  id: string;
  guaranteeId: string;
  createdAt?: string;
}

export interface ConciergeMessage {
  id: string;
  threadId: string;
  role: ConciergeRole;
  body: string;
  createdAt?: string;
}

export interface Profile {
  id: string;
  email?: string | null;
  fullName?: string | null;
  role: Role;
  /** Set for dealer role — scopes their location via RLS. */
  dealerLocationId?: string | null;
  phone?: string | null;
  createdAt?: string;
}

/**
 * A dealer/retail location. Serves the dealer-triage card (non-comfort issues)
 * and the shop coupon (v2 expansion). Keyed by the same text id that
 * `guarantees.dealer_location_id` and `profiles.dealer_location_id` reference.
 */
export interface DealerLocation {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  siteUrl?: string | null;
  couponCode?: string | null;
  /** Whole-percent discount for the coupon (e.g. 20 = 20% off). */
  couponPct?: number | null;
  createdAt?: string;
}
