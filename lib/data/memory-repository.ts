// lib/data/memory-repository.ts
// Local, zero-config fallback backed by lib/data/seed.ts. Lets the app run and
// every flow work with no Supabase keys, so M3 can be verified today. State
// (check-ins, concierge threads/messages) lives in memory for the process
// lifetime — getRepository() caches a single instance, so it persists across
// requests during a dev session.

import type {
  CheckIn,
  Claim,
  ClaimItem,
  ClaimPhoto,
  ClaimStatus,
  ConciergeMessage,
  ConciergeRole,
  ConciergeThread,
  Coupon,
  DealerLocation,
  Guarantee,
  InitialImpressionRecord,
  Journey,
  LinkVia,
  Tip,
} from "../types";
import { journeyDay, journeyPhase } from "../eligibility";
import { generateRaNumber, generateTrackingNumber } from "../ra";
import { couponExpiresAt, generateCouponCode, isCouponExpired } from "../coupon";
import { MAX_ITEMS, normalizeConfirmations } from "../fitting";
import { selectTip, type TipQuery } from "../tips";
import {
  type ClaimItemInput,
  type ClaimRecord,
  type ClaimRecordScope,
  type CreateDraftClaimInput,
  type GuaranteeRepository,
  type RecordClaimPhotoInput,
  type SaveCheckInInput,
  type SaveConcernInput,
  type SaveInitialImpressionInput,
  type SubmitClaimResult,
  type UpdateClaimInput,
  type VerifyInput,
  assertClaimStatusTransition,
  byMostRecent,
  lastNameMatches,
  sameCalendarDate,
  toClaimRecord,
  todayIso,
} from "./repository";
import {
  SEED_CLAIM_ITEMS,
  SEED_CLAIMS,
  SEED_DEALER_LOCATIONS,
  SEED_GUARANTEES,
  SEED_INITIAL_IMPRESSIONS,
  SEED_TIPS,
} from "./seed";

export class MemoryRepository implements GuaranteeRepository {
  private guarantees: Guarantee[];
  private tips: Tip[];
  private dealerLocations: DealerLocation[];
  private checkIns: CheckIn[] = [];
  private threads: ConciergeThread[] = [];
  private messages: ConciergeMessage[] = [];
  private impressions: InitialImpressionRecord[];
  private concerns: { guaranteeId: string; body: string; createdAt: string }[] = [];
  private claims: Claim[] = [];
  private claimItems: ClaimItem[] = [];
  private claimPhotos: ClaimPhoto[] = [];
  private coupons: Coupon[] = [];
  private seq = 0;

  constructor(
    guarantees: Guarantee[] = SEED_GUARANTEES,
    tips: Tip[] = SEED_TIPS,
    impressions: InitialImpressionRecord[] = SEED_INITIAL_IMPRESSIONS,
    dealerLocations: DealerLocation[] = SEED_DEALER_LOCATIONS
  ) {
    // Copy so linking a user (which writes consumerId onto a row) never leaks
    // between repository instances — the same guard the impressions have.
    this.guarantees = guarantees.map((g) => ({ ...g }));
    this.tips = tips;
    this.dealerLocations = dealerLocations;
    // Copy so seed data isn't mutated across repository instances (tests).
    this.impressions = impressions.map((i) => ({ ...i }));
    // Seeded requests, copied for the same reason — a status update on one
    // instance must never leak into the module-level seed.
    this.claims = SEED_CLAIMS.map((c) => ({
      ...c,
      confirmations: c.confirmations ? [...c.confirmations] : c.confirmations,
    }));
    this.claimItems = SEED_CLAIM_ITEMS.map((i) => ({ ...i }));
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  async getGuaranteeById(id: string): Promise<Guarantee | null> {
    return this.guarantees.find((g) => g.id === id) ?? null;
  }

  async getGuaranteeBySalesOrder(salesOrderNumber: string): Promise<Guarantee | null> {
    const needle = salesOrderNumber.trim().toLowerCase();
    return (
      this.guarantees.find(
        (g) => g.salesOrderNumber.trim().toLowerCase() === needle
      ) ?? null
    );
  }

  async getGuaranteeByToken(token: string): Promise<Guarantee | null> {
    const needle = token.trim();
    return this.guarantees.find((g) => g.accessToken === needle) ?? null;
  }

  async verifyGuarantee(input: VerifyInput): Promise<Guarantee | null> {
    if (input.mode === "lookup") {
      const g = await this.getGuaranteeBySalesOrder(input.salesOrderNumber);
      if (!g) return null;
      return lastNameMatches(input.lastName, g.customerLastName) ? g : null;
    }
    const g = await this.getGuaranteeByToken(input.token);
    if (!g) return null;
    const nameOk = lastNameMatches(input.lastName, g.customerLastName);
    const dateOk = sameCalendarDate(input.deliveryDate, g.deliveryDate);
    return nameOk && dateOk ? g : null;
  }

  async getJourney(guaranteeId: string, referenceDate: Date = new Date()): Promise<Journey | null> {
    const g = await this.getGuaranteeById(guaranteeId);
    if (!g) return null;
    const currentDay = journeyDay(g.deliveryDate, referenceDate);
    const resolved = await this.hasResolvedExchange(guaranteeId);
    return {
      id: `journey-${g.id}`,
      guaranteeId: g.id,
      startDate: g.deliveryDate,
      currentDay,
      phase: journeyPhase(currentDay, resolved),
    };
  }

  async hasResolvedExchange(guaranteeId: string): Promise<boolean> {
    // The two demo guarantees have no seeded claims, so a demo journey starts
    // live/unresolved; a claim only resolves the journey once it has actually
    // been approved or completed.
    return this.claims.some(
      (c) =>
        c.guaranteeId === guaranteeId &&
        ["approved", "dealer_scheduled", "completed"].includes(c.status)
    );
  }

  async listTips(): Promise<Tip[]> {
    return this.tips.filter((t) => t.active);
  }

  // --- M4: dealer locations ---

  async getDealerLocationById(id: string): Promise<DealerLocation | null> {
    const needle = id.trim();
    const found = this.dealerLocations.find((d) => d.id === needle);
    return found ? { ...found } : null;
  }

  async getDealerLocationForGuarantee(
    guaranteeId: string
  ): Promise<DealerLocation | null> {
    const g = await this.getGuaranteeById(guaranteeId);
    if (!g?.dealerLocationId) return null;
    return this.getDealerLocationById(g.dealerLocationId);
  }

  // --- M3: check-ins ---

  async getTodayCheckIn(
    guaranteeId: string,
    referenceDate: Date = new Date()
  ): Promise<CheckIn | null> {
    const today = todayIso(referenceDate);
    return (
      this.checkIns.find(
        (c) => c.guaranteeId === guaranteeId && sameCalendarDate(c.date, today)
      ) ?? null
    );
  }

  async saveCheckIn(
    input: SaveCheckInInput,
    referenceDate: Date = new Date()
  ): Promise<CheckIn> {
    const today = todayIso(referenceDate);
    const existing = this.checkIns.find(
      (c) => c.guaranteeId === input.guaranteeId && sameCalendarDate(c.date, today)
    );
    if (existing) {
      existing.feeling = input.feeling;
      existing.note = input.note ?? null;
      return existing;
    }
    const row: CheckIn = {
      id: this.nextId("checkin"),
      guaranteeId: input.guaranteeId,
      date: today,
      feeling: input.feeling,
      note: input.note ?? null,
      createdAt: new Date().toISOString(),
    };
    this.checkIns.push(row);
    return row;
  }

  // --- Initial impression (one-time) ---

  async getInitialImpression(
    guaranteeId: string
  ): Promise<InitialImpressionRecord | null> {
    const found = this.impressions.find((i) => i.guaranteeId === guaranteeId);
    return found ? { ...found } : null;
  }

  async saveInitialImpression(
    input: SaveInitialImpressionInput
  ): Promise<InitialImpressionRecord> {
    const existing = this.impressions.find(
      (i) => i.guaranteeId === input.guaranteeId
    );
    if (existing) {
      existing.impression = input.impression;
      existing.note = input.note ?? null;
      existing.at = new Date().toISOString();
      return { ...existing };
    }
    const row: InitialImpressionRecord = {
      guaranteeId: input.guaranteeId,
      impression: input.impression,
      note: input.note ?? null,
      at: new Date().toISOString(),
    };
    this.impressions.push(row);
    return { ...row };
  }

  // --- Concierge concerns (optional) ---

  async saveConcern(input: SaveConcernInput): Promise<void> {
    this.concerns.push({
      guaranteeId: input.guaranteeId,
      body: input.body,
      createdAt: new Date().toISOString(),
    });
  }

  // --- M5: the fitting ---

  async getDraftClaim(guaranteeId: string): Promise<Claim | null> {
    const found = this.claims.find(
      (c) => c.guaranteeId === guaranteeId && c.status === "draft"
    );
    return found ? { ...found } : null;
  }

  async createDraftClaim(input: CreateDraftClaimInput): Promise<Claim> {
    const existing = await this.getDraftClaim(input.guaranteeId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const row: Claim = {
      id: this.nextId("claim"),
      guaranteeId: input.guaranteeId,
      status: "draft",
      step: "intake",
      confirmations: [],
      preVerified: input.preVerified,
      reasonExperience: null,
      preferredReplacement: null,
      contactPhone: null,
      contactPhoneKind: null,
      contactEmail: null,
      atDeliveryAddress: null,
      newAddress: null,
      stillOwns: null,
      raNumber: null,
      trackingNumber: null,
      submittedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.claims.push(row);
    return { ...row };
  }

  async getClaimById(claimId: string): Promise<Claim | null> {
    const found = this.claims.find((c) => c.id === claimId);
    return found ? { ...found } : null;
  }

  async listClaimsForGuarantee(guaranteeId: string): Promise<Claim[]> {
    return this.claims
      .filter((c) => c.guaranteeId === guaranteeId)
      .map((c) => ({ ...c }))
      .sort(byMostRecent);
  }

  async updateClaim(claimId: string, patch: UpdateClaimInput): Promise<Claim> {
    const row = this.claims.find((c) => c.id === claimId);
    if (!row) throw new Error(`No claim ${claimId}`);
    if (patch.step !== undefined) row.step = patch.step;
    if (patch.reasonExperience !== undefined) row.reasonExperience = patch.reasonExperience;
    if (patch.preferredReplacement !== undefined) {
      row.preferredReplacement = patch.preferredReplacement;
    }
    if (patch.confirmations !== undefined) {
      row.confirmations = normalizeConfirmations(patch.confirmations);
    }
    if (patch.contactPhone !== undefined) row.contactPhone = patch.contactPhone;
    if (patch.contactPhoneKind !== undefined) row.contactPhoneKind = patch.contactPhoneKind;
    if (patch.contactEmail !== undefined) row.contactEmail = patch.contactEmail;
    if (patch.atDeliveryAddress !== undefined) row.atDeliveryAddress = patch.atDeliveryAddress;
    if (patch.newAddress !== undefined) row.newAddress = patch.newAddress;
    if (patch.stillOwns !== undefined) row.stillOwns = patch.stillOwns;
    row.updatedAt = new Date().toISOString();
    return { ...row };
  }

  async listClaimItems(claimId: string): Promise<ClaimItem[]> {
    return this.claimItems
      .filter((i) => i.claimId === claimId)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ ...i }));
  }

  async saveClaimItems(claimId: string, items: ClaimItemInput[]): Promise<ClaimItem[]> {
    this.claimItems = this.claimItems.filter((i) => i.claimId !== claimId);
    const now = new Date().toISOString();
    items.slice(0, MAX_ITEMS).forEach((input, position) => {
      this.claimItems.push({
        id: this.nextId("claim-item"),
        claimId,
        modelNumber: input.modelNumber.trim(),
        notSoiled: Boolean(input.notSoiled),
        noOdors: Boolean(input.noOdors),
        notDamaged: Boolean(input.notDamaged),
        position,
        createdAt: now,
      });
    });
    return this.listClaimItems(claimId);
  }

  async listClaimPhotos(claimId: string): Promise<ClaimPhoto[]> {
    return this.claimPhotos.filter((p) => p.claimId === claimId).map((p) => ({ ...p }));
  }

  async recordClaimPhoto(input: RecordClaimPhotoInput): Promise<ClaimPhoto> {
    // A retake replaces the angle rather than stacking rows.
    this.claimPhotos = this.claimPhotos.filter(
      (p) => !(p.claimId === input.claimId && p.angle === input.angle)
    );
    const now = new Date().toISOString();
    const row: ClaimPhoto = {
      id: this.nextId("claim-photo"),
      claimId: input.claimId,
      angle: input.angle,
      label: input.label,
      storagePath: input.storagePath ?? null,
      fileName: input.fileName ?? null,
      captured: true,
      capturedAt: now,
      createdAt: now,
    };
    this.claimPhotos.push(row);
    return { ...row };
  }

  async submitClaim(claimId: string): Promise<SubmitClaimResult> {
    const row = this.claims.find((c) => c.id === claimId);
    if (!row) throw new Error(`No claim ${claimId}`);
    // Idempotent: a second submit returns the numbers already issued.
    if (row.raNumber && row.trackingNumber) {
      return { claim: { ...row }, raNumber: row.raNumber, trackingNumber: row.trackingNumber };
    }
    const raNumber = generateRaNumber();
    const trackingNumber = generateTrackingNumber();
    const now = new Date().toISOString();
    row.raNumber = raNumber;
    row.trackingNumber = trackingNumber;
    row.status = "submitted";
    row.step = "submitted";
    row.submittedAt = now;
    row.updatedAt = now;
    return { claim: { ...row }, raNumber, trackingNumber };
  }

  async updateClaimStatus(claimId: string, status: ClaimStatus): Promise<Claim> {
    const row = this.claims.find((c) => c.id === claimId);
    if (!row) throw new Error(`No claim ${claimId}`);
    assertClaimStatusTransition(row.status, status);
    row.status = status;
    row.updatedAt = new Date().toISOString();
    return { ...row };
  }

  // --- M5b: the shop coupon ---

  async getActiveCoupon(guaranteeId: string): Promise<Coupon | null> {
    const newest = this.coupons
      .filter((c) => c.guaranteeId === guaranteeId)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
    if (!newest) return null;
    return isCouponExpired(newest) ? null : { ...newest };
  }

  async issueCoupon(guaranteeId: string): Promise<Coupon> {
    // Idempotent: an unexpired code is already in the customer's hands.
    const active = await this.getActiveCoupon(guaranteeId);
    if (active) return active;

    const guarantee = await this.getGuaranteeById(guaranteeId);
    const dealer = await this.getDealerLocationForGuarantee(guaranteeId);
    const issuedAt = new Date().toISOString();
    const row: Coupon = {
      id: this.nextId("coupon"),
      guaranteeId,
      dealerLocationId: guarantee?.dealerLocationId ?? null,
      code: generateCouponCode(),
      // Snapshot, not a live read — a later dealer change must not alter a
      // code already handed out.
      pct: dealer?.couponPct ?? null,
      issuedAt,
      expiresAt: couponExpiresAt(issuedAt),
    };
    this.coupons.push(row);
    return { ...row };
  }

  // --- M6: the user <-> guarantee link ---

  async getGuaranteeForUser(userId: string): Promise<Guarantee | null> {
    const needle = (userId ?? "").trim();
    if (!needle) return null;
    const found = this.guarantees.find((g) => g.consumerId === needle);
    return found ? { ...found } : null;
  }

  async linkGuaranteeToUser(
    guaranteeId: string,
    userId: string,
    via: LinkVia
  ): Promise<Guarantee | null> {
    const row = this.guarantees.find((g) => g.id === guaranteeId);
    if (!row) return null;
    // A purchase belongs to exactly one account.
    if (row.consumerId && row.consumerId !== userId) return null;
    row.consumerId = userId;
    row.linkedVia = via;
    return { ...row };
  }

  async listClaimRecords(scope: ClaimRecordScope): Promise<ClaimRecord[]> {
    const rows: ClaimRecord[] = [];
    for (const claim of this.claims) {
      // Drafts aren't requests yet — they're an in-progress fitting.
      if (claim.status === "draft") continue;
      const guarantee = this.guarantees.find((g) => g.id === claim.guaranteeId);
      if (!guarantee) continue;
      if (
        scope.kind === "dealer_location" &&
        guarantee.dealerLocationId !== scope.dealerLocationId
      ) {
        continue;
      }
      rows.push(toClaimRecord(claim, guarantee));
    }
    return rows.sort(byMostRecent);
  }

  // --- M3: tips ---

  async getTip(query: TipQuery): Promise<Tip | null> {
    return selectTip(this.tips, query);
  }

  // --- M3: concierge ---

  async getOrCreateConciergeThread(guaranteeId: string): Promise<ConciergeThread> {
    let thread = this.threads.find((t) => t.guaranteeId === guaranteeId);
    if (!thread) {
      thread = {
        id: this.nextId("thread"),
        guaranteeId,
        createdAt: new Date().toISOString(),
      };
      this.threads.push(thread);
    }
    return thread;
  }

  async listConciergeMessages(threadId: string): Promise<ConciergeMessage[]> {
    // Array insertion order is chronological.
    return this.messages.filter((m) => m.threadId === threadId);
  }

  async addConciergeMessage(
    threadId: string,
    role: ConciergeRole,
    body: string
  ): Promise<ConciergeMessage> {
    const row: ConciergeMessage = {
      id: this.nextId("msg"),
      threadId,
      role,
      body,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(row);
    return row;
  }
}
