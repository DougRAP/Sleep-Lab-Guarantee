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
  ClaimLink,
  ClaimNote,
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
import { generateClaimNumber } from "../ra";
import { couponExpiresAt, generateCouponCode, isCouponExpired } from "../coupon";
import { MAX_ITEMS, normalizeConfirmations } from "../fitting";
import { selectTip, type TipQuery } from "../tips";
import {
  type AddClaimLinkInput,
  type AddClaimNoteInput,
  type ClaimItemInput,
  type ClaimRecord,
  type ClaimRecordFilters,
  type ClaimRecordScope,
  type ConciergeUsageDay,
  type ConciergeUsageInput,
  type CreateAnonymousClaimInput,
  type CreateDraftClaimInput,
  type GuaranteeRepository,
  type RecordClaimPhotoInput,
  type SaveCheckInInput,
  type SaveConcernInput,
  type SaveInitialImpressionInput,
  type SubmitClaimOptions,
  type SubmitClaimResult,
  type UpdateClaimInput,
  type VerifyInput,
  CLAIM_SEARCH_LIMIT,
  assertClaimStatusTransition,
  assertExchangeRecordable,
  byMostRecent,
  claimNumberQuery,
  claimRecordFilterMatches,
  claimSearchMatches,
  lastNameMatches,
  matchGuarantee,
  sameCalendarDate,
  toClaimRecord,
  todayIso,
} from "./repository";
import {
  DEFAULT_DEALER_LOCATION_ID,
  SEED_CLAIM_ITEMS,
  SEED_CLAIM_NOTES,
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
  private usageRows: (ConciergeUsageInput & { createdAt: string })[] = [];
  private rateCounters = new Map<string, number>();
  private appSettings: Record<string, number> = {};
  private impressions: InitialImpressionRecord[];
  private concerns: { guaranteeId: string; body: string; createdAt: string }[] = [];
  private claims: Claim[] = [];
  private claimItems: ClaimItem[] = [];
  private claimPhotos: ClaimPhoto[] = [];
  private claimNotes: ClaimNote[] = [];
  private claimLinks: ClaimLink[] = [];
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
    this.claimNotes = SEED_CLAIM_NOTES.map((n) => ({ ...n }));
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
      claimNumber: null,
      submittedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.claims.push(row);
    return { ...row };
  }

  // --- v3: anonymous claim-first intake ---

  async createAnonymousClaim(input: CreateAnonymousClaimInput): Promise<Claim> {
    const now = new Date().toISOString();
    const row: Claim = {
      id: this.nextId("claim"),
      guaranteeId: null,
      dealerLocationId: DEFAULT_DEALER_LOCATION_ID,
      status: "draft",
      step: "intake",
      confirmations: [],
      preVerified: false,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      deliveryZip: input.deliveryZip.trim(),
      salesOrderNumber: null,
      modelNumber: null,
      purchaseDate: null,
      deliveryDate: null,
      protectorUsed: null,
      daysInServiceAtSubmit: null,
      earlyPreference: null,
      ttcClaim: null,
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
      claimNumber: null,
      submittedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.claims.push(row);
    return { ...row };
  }

  async getClaimByNumber(claimNumber: string): Promise<Claim | null> {
    const needle = claimNumberQuery(claimNumber);
    if (!needle) return null;
    const found = this.claims.find(
      (c) => (c.claimNumber ?? "").trim().toUpperCase() === needle
    );
    return found ? { ...found } : null;
  }

  async linkClaimToGuaranteeIfMatched(claimId: string): Promise<Claim> {
    const row = this.claims.find((c) => c.id === claimId);
    if (!row) throw new Error(`No claim ${claimId}`);
    // Already linked, or nothing to match on — leave it alone, never throw.
    if (row.guaranteeId || !row.lastName || !row.deliveryZip) return { ...row };
    const match = matchGuarantee(this.guarantees, {
      lastName: row.lastName,
      deliveryZip: row.deliveryZip,
      salesOrderNumber: row.salesOrderNumber ?? null,
    });
    if (!match) return { ...row };
    row.guaranteeId = match.id;
    // Carry the linked account (when the guarantee has one) so ownership reads
    // resolve, mirroring linkGuaranteeToUser's backfill.
    if (!row.consumerId && match.consumerId) row.consumerId = match.consumerId;
    row.updatedAt = new Date().toISOString();
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
    if (patch.salesOrderNumber !== undefined) row.salesOrderNumber = patch.salesOrderNumber;
    if (patch.modelNumber !== undefined) row.modelNumber = patch.modelNumber;
    if (patch.purchaseDate !== undefined) row.purchaseDate = patch.purchaseDate;
    if (patch.deliveryDate !== undefined) row.deliveryDate = patch.deliveryDate;
    if (patch.protectorUsed !== undefined) row.protectorUsed = patch.protectorUsed;
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

  async submitClaim(
    claimId: string,
    options?: SubmitClaimOptions
  ): Promise<SubmitClaimResult> {
    const row = this.claims.find((c) => c.id === claimId);
    if (!row) throw new Error(`No claim ${claimId}`);
    // Idempotent: a second submit returns the number already issued (v3 — the
    // claim number is the single reference; RA/tracking are no longer minted).
    if (row.claimNumber && row.submittedAt) {
      return {
        claim: { ...row },
        claimNumber: row.claimNumber,
        raNumber: row.raNumber ?? null,
        trackingNumber: row.trackingNumber ?? null,
      };
    }
    if (!row.claimNumber) {
      // Regenerate on the (astronomically rare) in-memory collision — the
      // Supabase impl gets the same guarantee from the unique constraint.
      let minted = generateClaimNumber();
      while (this.claims.some((c) => c.claimNumber === minted)) {
        minted = generateClaimNumber();
      }
      row.claimNumber = minted;
    }
    const now = new Date().toISOString();
    if (row.deliveryDate) {
      row.daysInServiceAtSubmit = journeyDay(row.deliveryDate, new Date());
    }
    if (options?.earlyPreference !== undefined) {
      row.earlyPreference = options.earlyPreference;
    }
    row.status = "submitted";
    row.step = "submitted";
    row.submittedAt = now;
    row.updatedAt = now;
    // Auto-match anonymous claims to a registered guarantee — never blocking.
    if (!row.guaranteeId) await this.linkClaimToGuaranteeIfMatched(row.id);
    return {
      claim: { ...row },
      claimNumber: row.claimNumber,
      raNumber: row.raNumber ?? null,
      trackingNumber: row.trackingNumber ?? null,
    };
  }

  async updateClaimStatus(claimId: string, status: ClaimStatus): Promise<Claim> {
    const row = this.claims.find((c) => c.id === claimId);
    if (!row) throw new Error(`No claim ${claimId}`);
    assertClaimStatusTransition(row.status, status);
    row.status = status;
    row.updatedAt = new Date().toISOString();
    return { ...row };
  }

  async recordExchangeSalesOrder(
    claimId: string,
    salesOrderNumber: string
  ): Promise<Claim> {
    const row = this.claims.find((c) => c.id === claimId);
    if (!row) throw new Error(`No claim ${claimId}`);
    assertExchangeRecordable(row.status, salesOrderNumber);
    const now = new Date().toISOString();
    row.exchangeSalesOrderNumber = salesOrderNumber.trim();
    if (row.status !== "completed") {
      row.status = "completed";
      row.completedAt = now;
    }
    row.updatedAt = now;
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
    // The most recent purchase = the default active one (B-28).
    const list = await this.listGuaranteesForUser(userId);
    return list[0] ?? null;
  }

  async listGuaranteesForUser(userId: string): Promise<Guarantee[]> {
    const needle = (userId ?? "").trim();
    if (!needle) return [];
    return this.guarantees
      .filter((g) => g.consumerId === needle)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .map((g) => ({ ...g }));
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

  async listClaimRecords(
    scope: ClaimRecordScope,
    query?: string,
    filters?: ClaimRecordFilters
  ): Promise<ClaimRecord[]> {
    const needle = (query ?? "").trim();
    const rows: ClaimRecord[] = [];
    for (const claim of this.claims) {
      // Drafts aren't requests yet — they're an in-progress fitting.
      if (claim.status === "draft") continue;
      // v3 (M-S4): an UNLINKED claim (guaranteeId null) is first-class — it
      // renders from its own fields. A linked claim whose guarantee row is
      // missing is a data hole and stays skipped.
      const guarantee = claim.guaranteeId
        ? this.guarantees.find((g) => g.id === claim.guaranteeId)
        : null;
      if (claim.guaranteeId && !guarantee) continue;
      const record = toClaimRecord(claim, guarantee ?? null);
      // The scope lives inside the read, never in the caller's UI. It keys off
      // the EFFECTIVE dealer location (claim's own column, else the guarantee's).
      if (
        scope.kind === "dealer_location" &&
        record.dealerLocationId !== scope.dealerLocationId
      ) {
        continue;
      }
      if (needle && !claimSearchMatches(needle, guarantee ?? null, claim)) continue;
      if (!claimRecordFilterMatches(filters, claim)) continue;
      rows.push(record);
    }
    const sorted = rows.sort(byMostRecent);
    return needle ? sorted.slice(0, CLAIM_SEARCH_LIMIT) : sorted;
  }

  async getClaimRecord(
    scope: ClaimRecordScope,
    claimId: string
  ): Promise<ClaimRecord | null> {
    const claim = this.claims.find((c) => c.id === claimId);
    // A draft is an in-progress fitting, not a request the desk can open.
    if (!claim || claim.status === "draft") return null;
    // Unlinked claims render from their own fields (v3, M-S4); a linked claim
    // whose guarantee row is missing stays null (data hole).
    const guarantee = claim.guaranteeId
      ? this.guarantees.find((g) => g.id === claim.guaranteeId)
      : null;
    if (claim.guaranteeId && !guarantee) return null;
    const record = toClaimRecord(claim, guarantee ?? null);
    // Out-of-scope must be indistinguishable from nonexistent (same null).
    if (
      scope.kind === "dealer_location" &&
      record.dealerLocationId !== scope.dealerLocationId
    ) {
      return null;
    }
    return record;
  }

  // --- Dealer desk: the claim-notes thread ---

  async listClaimNotes(claimId: string): Promise<ClaimNote[]> {
    return this.claimNotes
      .filter((n) => n.claimId === claimId)
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
      .map((n) => ({ ...n }));
  }

  async addClaimNote(claimId: string, input: AddClaimNoteInput): Promise<ClaimNote> {
    const claim = this.claims.find((c) => c.id === claimId);
    if (!claim) throw new Error(`No claim ${claimId}`);
    const row: ClaimNote = {
      id: this.nextId("claim-note"),
      claimId,
      authorId: input.authorId ?? null,
      author: input.author,
      body: input.body.trim(),
      // Part of the shared dealer <-> RAP thread — not an internal-only note.
      isInternal: false,
      createdAt: new Date().toISOString(),
    };
    this.claimNotes.push(row);
    return { ...row };
  }

  // --- v3: claim links (EA docs / tech reports) ---

  async listClaimLinks(claimId: string): Promise<ClaimLink[]> {
    return this.claimLinks
      .filter((l) => l.claimId === claimId)
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
      .map((l) => ({ ...l }));
  }

  async addClaimLink(claimId: string, input: AddClaimLinkInput): Promise<ClaimLink> {
    const claim = this.claims.find((c) => c.id === claimId);
    if (!claim) throw new Error(`No claim ${claimId}`);
    const row: ClaimLink = {
      id: this.nextId("claim-link"),
      claimId,
      kind: input.kind,
      url: input.url.trim(),
      label: input.label?.trim() || null,
      createdBy: input.createdBy ?? null,
      createdAt: new Date().toISOString(),
    };
    this.claimLinks.push(row);
    return { ...row };
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

  // --- B-11: coach usage telemetry ---

  async recordConciergeUsage(input: ConciergeUsageInput): Promise<void> {
    this.usageRows.push({ ...input, createdAt: new Date().toISOString() });
  }

  async listConciergeUsageDaily(days = 30): Promise<ConciergeUsageDay[]> {
    const cutoff = new Date(Date.now() - days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const byDay = new Map<string, ConciergeUsageDay>();
    for (const row of this.usageRows) {
      const day = row.createdAt.slice(0, 10);
      if (day < cutoff) continue;
      const agg =
        byDay.get(day) ??
        {
          day,
          replies: 0,
          apiCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        };
      agg.replies += 1;
      agg.apiCalls += row.apiCalls;
      agg.inputTokens += row.inputTokens;
      agg.outputTokens += row.outputTokens;
      agg.cacheCreationTokens += row.cacheCreationTokens;
      agg.cacheReadTokens += row.cacheReadTokens;
      byDay.set(day, agg);
    }
    return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
  }

  // --- B-13: settings + rate limiting + chat quotas ---

  async getAppSettings(): Promise<Record<string, number>> {
    return { ...this.appSettings };
  }

  async bumpRateCounter(bucket: string, key: string, windowStartIso: string): Promise<number> {
    const k = `${bucket}\u0000${key}\u0000${windowStartIso}`;
    const next = (this.rateCounters.get(k) ?? 0) + 1;
    this.rateCounters.set(k, next);
    return next;
  }

  async countConciergeRepliesSince(guaranteeId: string, sinceIso: string): Promise<number> {
    const threadIds = new Set(
      this.threads.filter((t) => t.guaranteeId === guaranteeId).map((t) => t.id)
    );
    return this.messages.filter(
      (m) =>
        m.role === "assistant" &&
        threadIds.has(m.threadId) &&
        (m.createdAt ?? "") >= sinceIso
    ).length;
  }

  async countConciergeRepliesGlobalSince(sinceIso: string): Promise<number> {
    return this.messages.filter(
      (m) => m.role === "assistant" && (m.createdAt ?? "") >= sinceIso
    ).length;
  }
}
