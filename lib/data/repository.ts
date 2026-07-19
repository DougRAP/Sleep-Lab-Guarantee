// lib/data/repository.ts
// The data seam. UI and server code call this interface — never Supabase
// directly. Backed by Supabase when NEXT_PUBLIC_SUPABASE_URL is set, otherwise
// by the in-memory seed (see ./index).

import type {
  CheckIn,
  ConciergeMessage,
  ConciergeRole,
  ConciergeThread,
  Feeling,
  Guarantee,
  Journey,
  Tip,
} from "../types";
import type { TipQuery } from "../tips";

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

  // --- M3: check-in persistence (PRD §2a) ---
  /** Today's check-in for this guarantee, or null if none logged yet. */
  getTodayCheckIn(guaranteeId: string, referenceDate?: Date): Promise<CheckIn | null>;
  /** Persist tonight's check-in. Idempotent per day — re-logging updates today's entry. */
  saveCheckIn(input: SaveCheckInInput, referenceDate?: Date): Promise<CheckIn>;

  // --- M3: tunable tips (PRD §2a) ---
  /** Select the best on-brand tip for the current journey day + phase (+ time-of-day). */
  getTip(query: TipQuery): Promise<Tip | null>;

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
  // Accept "Andrew Turnbull" when the record's last name is "Turnbull".
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
