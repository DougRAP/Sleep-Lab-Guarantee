// lib/types.ts
// Domain types for RAP Sleep Lab (M2). Mirrors supabase/schema.sql.
// TS uses camelCase; the repository layer maps to/from snake_case columns.

export type Role = "consumer" | "rap_admin" | "dealer";

/** The 90-night journey phase (see PRD §2a / §6). */
export type JourneyPhase = "settle_in" | "safety_net" | "expired" | "resolved";

/** Comfort-exchange status machine (PRD §4). */
export type ClaimStatus =
  | "submitted"
  | "in_review"
  | "approved"
  | "dealer_scheduled"
  | "completed"
  | "denied"
  | "expired"
  | "withdrawn";

export type PhotoAngle = "law_tag" | "model_tag" | "overall" | "protector";

export type Feeling = "better" | "same" | "rougher";

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
  createdAt?: string;
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
  raNumber?: string | null;
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

export interface ClaimPhoto {
  id: string;
  claimId: string;
  angle: PhotoAngle;
  storagePath: string;
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
