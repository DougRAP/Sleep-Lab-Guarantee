// lib/data/supabase-repository.ts
// Supabase-backed repository. Active when NEXT_PUBLIC_SUPABASE_URL is set.
// Uses the service-role client for server-authoritative reads/writes (the
// consumer has no auth user yet in v1 — light verify is a signed cookie).

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
import { createServiceClient } from "../supabase/server";
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
  lastNameMatches,
  matchGuarantee,
  phoneDigits,
  zipQuery,
  sameCalendarDate,
  toClaimRecord,
  todayIso,
} from "./repository";
import { DEFAULT_DEALER_LOCATION_ID } from "./seed";

/** The day after a plain YYYY-MM-DD date — the exclusive upper bound that makes
 *  an inclusive plain-date filter correct over a timestamptz column. */
function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toGuarantee(row: any): Guarantee {
  return {
    id: row.id,
    salesOrderNumber: row.sales_order_number,
    guaranteeNumber: row.guarantee_number,
    customerFirstName: row.customer_first_name,
    customerLastName: row.customer_last_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    customerStreet: row.customer_street ?? null,
    customerStreet2: row.customer_street2 ?? null,
    customerCity: row.customer_city ?? null,
    customerState: row.customer_state ?? null,
    customerZip: row.customer_zip ?? null,
    dealerName: row.dealer_name,
    dealerLocationId: row.dealer_location_id,
    manufacturer: row.manufacturer,
    oemModel: row.oem_model,
    productDescription: row.product_description,
    purchasePrice: row.purchase_price,
    deliveryDate: String(row.delivery_date).slice(0, 10),
    accessToken: row.access_token,
    consumerId: row.consumer_id ?? null,
    linkedVia: row.linked_via ?? null,
    createdAt: row.created_at,
  };
}

function toTip(row: any): Tip {
  return {
    id: row.id,
    dayMin: row.day_min,
    dayMax: row.day_max,
    phase: row.phase,
    timeOfDay: row.time_of_day,
    title: row.title,
    body: row.body,
    active: row.active,
  };
}

function toCheckIn(row: any): CheckIn {
  return {
    id: row.id,
    guaranteeId: row.guarantee_id,
    date: String(row.date).slice(0, 10),
    feeling: row.feeling,
    note: row.note,
    createdAt: row.created_at,
  };
}

function toThread(row: any): ConciergeThread {
  return { id: row.id, guaranteeId: row.guarantee_id, createdAt: row.created_at };
}

function toMessage(row: any): ConciergeMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    body: row.body,
    createdAt: row.created_at,
  };
}

function toClaim(row: any): Claim {
  return {
    id: row.id,
    guaranteeId: row.guarantee_id ?? null,
    consumerId: row.consumer_id,
    status: row.status,
    raNumber: row.ra_number,
    trackingNumber: row.tracking_number,
    claimNumber: row.claim_number ?? null,
    ttcClaim: row.ttc_claim ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    deliveryZip: row.delivery_zip ?? null,
    salesOrderNumber: row.sales_order_number ?? null,
    modelNumber: row.model_number ?? null,
    purchaseDate: row.purchase_date ? String(row.purchase_date).slice(0, 10) : null,
    deliveryDate: row.delivery_date ? String(row.delivery_date).slice(0, 10) : null,
    protectorUsed: row.protector_used ?? null,
    daysInServiceAtSubmit: row.days_in_service_at_submit ?? null,
    earlyPreference: row.early_preference ?? null,
    dealerLocationId: row.dealer_location_id ?? null,
    reasonExperience: row.reason_experience,
    preferredReplacement: row.preferred_replacement,
    step: row.step ?? "intake",
    confirmations: normalizeConfirmations(row.confirmations ?? []),
    preVerified: row.pre_verified ?? false,
    contactPhone: row.contact_phone,
    contactPhoneKind: row.contact_phone_kind,
    contactEmail: row.contact_email,
    atDeliveryAddress: row.at_delivery_address,
    newAddress: row.new_address,
    stillOwns: row.still_owns,
    denialReason: row.denial_reason,
    exchangeSalesOrderNumber: row.exchange_sales_order_number ?? null,
    restockingFee: row.restocking_fee,
    priceDifference: row.price_difference,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    approvedAt: row.approved_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toClaimItem(row: any): ClaimItem {
  return {
    id: row.id,
    claimId: row.claim_id,
    modelNumber: row.model_number,
    notSoiled: Boolean(row.not_soiled),
    noOdors: Boolean(row.no_odors),
    notDamaged: Boolean(row.not_damaged),
    position: row.position ?? 0,
    createdAt: row.created_at,
  };
}

function toClaimPhoto(row: any): ClaimPhoto {
  return {
    id: row.id,
    claimId: row.claim_id,
    angle: row.angle,
    storagePath: row.storage_path,
    label: row.label,
    fileName: row.file_name,
    captured: row.captured ?? true,
    capturedAt: row.captured_at,
    aiCoach: row.ai_coach,
    createdAt: row.created_at,
  };
}

function toCoupon(row: any): Coupon {
  return {
    id: row.id,
    guaranteeId: row.guarantee_id,
    dealerLocationId: row.dealer_location_id ?? null,
    code: row.code,
    pct: row.pct ?? null,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
  };
}

function toClaimNote(row: any): ClaimNote {
  // `author` is the embedded profiles row (via author_id); the role becomes the
  // thread byline. There is no role column on claim_notes — it's derived.
  const role = row.author?.role;
  return {
    id: row.id,
    claimId: row.claim_id,
    authorId: row.author_id ?? null,
    author: role === "dealer" || role === "rap_admin" ? role : null,
    body: row.body,
    isInternal: Boolean(row.is_internal),
    createdAt: row.created_at,
  };
}

function toClaimLink(row: any): ClaimLink {
  return {
    id: row.id,
    claimId: row.claim_id,
    kind: row.kind,
    url: row.url,
    label: row.label ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

function toDealerLocation(row: any): DealerLocation {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    siteUrl: row.site_url,
    couponCode: row.coupon_code,
    couponPct: row.coupon_pct,
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A search box value made safe for a PostgREST `.or(...ilike...)` clause: the
 * characters that would break the filter grammar (comma, quotes, parens) become
 * spaces, and the LIKE wildcards are escaped — the query is text, never a
 * pattern language.
 */
function ilikeNeedle(value: string): string {
  return value
    .replace(/["',()]/g, " ")
    .replace(/[%_]/g, (m) => `\\${m}`)
    .trim();
}

export class SupabaseRepository implements GuaranteeRepository {
  private db = createServiceClient();

  async getGuaranteeById(id: string): Promise<Guarantee | null> {
    const { data } = await this.db.from("guarantees").select("*").eq("id", id).maybeSingle();
    return data ? toGuarantee(data) : null;
  }

  async getGuaranteeBySalesOrder(salesOrderNumber: string): Promise<Guarantee | null> {
    const { data } = await this.db
      .from("guarantees")
      .select("*")
      .eq("sales_order_number", salesOrderNumber.trim())
      .maybeSingle();
    return data ? toGuarantee(data) : null;
  }

  async getGuaranteeByToken(token: string): Promise<Guarantee | null> {
    const { data } = await this.db
      .from("guarantees")
      .select("*")
      .eq("access_token", token.trim())
      .maybeSingle();
    return data ? toGuarantee(data) : null;
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
    const { data } = await this.db
      .from("claims")
      .select("id")
      .eq("guarantee_id", guaranteeId)
      .in("status", ["approved", "dealer_scheduled", "completed"])
      .limit(1);
    return Boolean(data && data.length > 0);
  }

  async listTips(): Promise<Tip[]> {
    const { data } = await this.db.from("tips").select("*").eq("active", true);
    return (data ?? []).map(toTip);
  }

  // --- M4: dealer locations ---

  async getDealerLocationById(id: string): Promise<DealerLocation | null> {
    const { data } = await this.db
      .from("dealer_locations")
      .select("*")
      .eq("id", id.trim())
      .maybeSingle();
    return data ? toDealerLocation(data) : null;
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
    const { data } = await this.db
      .from("check_ins")
      .select("*")
      .eq("guarantee_id", guaranteeId)
      .eq("date", todayIso(referenceDate))
      .order("created_at", { ascending: false })
      .limit(1);
    return data && data[0] ? toCheckIn(data[0]) : null;
  }

  async saveCheckIn(
    input: SaveCheckInInput,
    referenceDate: Date = new Date()
  ): Promise<CheckIn> {
    const existing = await this.getTodayCheckIn(input.guaranteeId, referenceDate);
    if (existing) {
      const { data } = await this.db
        .from("check_ins")
        .update({ feeling: input.feeling, note: input.note ?? null })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      return data
        ? toCheckIn(data)
        : { ...existing, feeling: input.feeling, note: input.note ?? null };
    }
    const { data } = await this.db
      .from("check_ins")
      .insert({
        guarantee_id: input.guaranteeId,
        date: todayIso(referenceDate),
        feeling: input.feeling,
        note: input.note ?? null,
      })
      .select("*")
      .maybeSingle();
    return toCheckIn(data);
  }

  // --- Initial impression (one-time) — stored on the journey row ---

  async getInitialImpression(
    guaranteeId: string
  ): Promise<InitialImpressionRecord | null> {
    const { data } = await this.db
      .from("journey")
      .select("initial_impression, initial_impression_note, initial_impression_at")
      .eq("guarantee_id", guaranteeId)
      .maybeSingle();
    if (!data || !data.initial_impression) return null;
    return {
      guaranteeId,
      impression: data.initial_impression,
      note: data.initial_impression_note,
      at: data.initial_impression_at,
    };
  }

  async saveInitialImpression(
    input: SaveInitialImpressionInput
  ): Promise<InitialImpressionRecord> {
    const g = await this.getGuaranteeById(input.guaranteeId);
    const at = new Date().toISOString();
    const startDate = g?.deliveryDate ?? todayIso();
    const currentDay = g ? journeyDay(g.deliveryDate) : 0;
    const phase = journeyPhase(currentDay, false);
    // Upsert the journey row so the impression columns are always present.
    await this.db.from("journey").upsert(
      {
        guarantee_id: input.guaranteeId,
        start_date: startDate,
        current_day: currentDay,
        phase,
        initial_impression: input.impression,
        initial_impression_note: input.note ?? null,
        initial_impression_at: at,
      },
      { onConflict: "guarantee_id" }
    );
    return {
      guaranteeId: input.guaranteeId,
      impression: input.impression,
      note: input.note ?? null,
      at,
    };
  }

  // --- Concierge concerns (optional) ---

  async saveConcern(input: SaveConcernInput): Promise<void> {
    await this.db
      .from("concerns")
      .insert({ guarantee_id: input.guaranteeId, body: input.body });
  }

  // --- M5: the fitting ---

  async getDraftClaim(guaranteeId: string): Promise<Claim | null> {
    const { data } = await this.db
      .from("claims")
      .select("*")
      .eq("guarantee_id", guaranteeId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1);
    return data && data[0] ? toClaim(data[0]) : null;
  }

  async createDraftClaim(input: CreateDraftClaimInput): Promise<Claim> {
    const existing = await this.getDraftClaim(input.guaranteeId);
    if (existing) return existing;
    // Carry the linked account onto the claim so claims RLS (consumer_id =
    // auth.uid()) resolves without a join.
    const guarantee = await this.getGuaranteeById(input.guaranteeId);
    const { data } = await this.db
      .from("claims")
      .insert({
        guarantee_id: input.guaranteeId,
        consumer_id: guarantee?.consumerId ?? null,
        status: "draft",
        step: "intake",
        confirmations: [],
        pre_verified: input.preVerified,
        submitted_at: null,
      })
      .select("*")
      .maybeSingle();
    return toClaim(data);
  }

  async getClaimById(claimId: string): Promise<Claim | null> {
    const { data } = await this.db
      .from("claims")
      .select("*")
      .eq("id", claimId)
      .maybeSingle();
    return data ? toClaim(data) : null;
  }

  async listClaimsForGuarantee(guaranteeId: string): Promise<Claim[]> {
    // Scoped to the one guarantee, drafts included — the opposite of the
    // admin read, on purpose (see the interface comment).
    const { data } = await this.db
      .from("claims")
      .select("*")
      .eq("guarantee_id", guaranteeId)
      .order("updated_at", { ascending: false });
    return (data ?? []).map(toClaim).sort(byMostRecent);
  }

  async updateClaim(claimId: string, patch: UpdateClaimInput): Promise<Claim> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};
    if (patch.step !== undefined) row.step = patch.step;
    if (patch.reasonExperience !== undefined) row.reason_experience = patch.reasonExperience;
    if (patch.preferredReplacement !== undefined) {
      row.preferred_replacement = patch.preferredReplacement;
    }
    if (patch.confirmations !== undefined) {
      row.confirmations = normalizeConfirmations(patch.confirmations);
    }
    if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone;
    if (patch.contactPhoneKind !== undefined) row.contact_phone_kind = patch.contactPhoneKind;
    if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail;
    if (patch.atDeliveryAddress !== undefined) row.at_delivery_address = patch.atDeliveryAddress;
    if (patch.newAddress !== undefined) row.new_address = patch.newAddress;
    if (patch.stillOwns !== undefined) row.still_owns = patch.stillOwns;
    if (patch.salesOrderNumber !== undefined) row.sales_order_number = patch.salesOrderNumber;
    if (patch.modelNumber !== undefined) row.model_number = patch.modelNumber;
    if (patch.purchaseDate !== undefined) row.purchase_date = patch.purchaseDate;
    if (patch.deliveryDate !== undefined) row.delivery_date = patch.deliveryDate;
    if (patch.protectorUsed !== undefined) row.protector_used = patch.protectorUsed;

    const { data } = await this.db
      .from("claims")
      .update(row)
      .eq("id", claimId)
      .select("*")
      .maybeSingle();
    return toClaim(data);
  }

  async listClaimItems(claimId: string): Promise<ClaimItem[]> {
    const { data } = await this.db
      .from("claim_items")
      .select("*")
      .eq("claim_id", claimId)
      .order("position", { ascending: true });
    return (data ?? []).map(toClaimItem);
  }

  async saveClaimItems(claimId: string, items: ClaimItemInput[]): Promise<ClaimItem[]> {
    await this.db.from("claim_items").delete().eq("claim_id", claimId);
    const rows = items.slice(0, MAX_ITEMS).map((input, position) => ({
      claim_id: claimId,
      model_number: input.modelNumber.trim(),
      not_soiled: Boolean(input.notSoiled),
      no_odors: Boolean(input.noOdors),
      not_damaged: Boolean(input.notDamaged),
      position,
    }));
    if (rows.length) await this.db.from("claim_items").insert(rows);
    return this.listClaimItems(claimId);
  }

  async listClaimPhotos(claimId: string): Promise<ClaimPhoto[]> {
    const { data } = await this.db
      .from("claim_photos")
      .select("*")
      .eq("claim_id", claimId)
      .order("created_at", { ascending: true });
    return (data ?? []).map(toClaimPhoto);
  }

  async recordClaimPhoto(input: RecordClaimPhotoInput): Promise<ClaimPhoto> {
    // A retake replaces the angle rather than stacking rows.
    await this.db
      .from("claim_photos")
      .delete()
      .eq("claim_id", input.claimId)
      .eq("angle", input.angle);
    const { data } = await this.db
      .from("claim_photos")
      .insert({
        claim_id: input.claimId,
        angle: input.angle,
        label: input.label,
        storage_path: input.storagePath ?? null,
        file_name: input.fileName ?? null,
        captured: true,
        captured_at: new Date().toISOString(),
      })
      .select("*")
      .maybeSingle();
    return toClaimPhoto(data);
  }

  async submitClaim(
    claimId: string,
    options?: SubmitClaimOptions
  ): Promise<SubmitClaimResult> {
    const existing = await this.getClaimById(claimId);
    if (!existing) throw new Error(`No claim ${claimId}`);
    // Idempotent: a second submit returns the number already issued (v3 — the
    // claim number is the single reference; RA/tracking are no longer minted).
    if (existing.claimNumber && existing.submittedAt) {
      return {
        claim: existing,
        claimNumber: existing.claimNumber,
        raNumber: existing.raNumber ?? null,
        trackingNumber: existing.trackingNumber ?? null,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = {
      status: "submitted",
      step: "submitted",
      submitted_at: new Date().toISOString(),
    };
    if (existing.deliveryDate) {
      patch.days_in_service_at_submit = journeyDay(existing.deliveryDate, new Date());
    }
    if (options?.earlyPreference !== undefined) {
      patch.early_preference = options.earlyPreference;
    }

    // Mint the claim number (keep one already set), retrying on the unique
    // constraint — a collision just draws again.
    let claimNumber = existing.claimNumber ?? generateClaimNumber();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updated: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await this.db
        .from("claims")
        .update({ ...patch, claim_number: claimNumber })
        .eq("id", claimId)
        .select("*")
        .maybeSingle();
      if (!error) {
        updated = data;
        break;
      }
      if (error.code !== "23505") throw error;
      claimNumber = generateClaimNumber();
    }
    if (!updated) throw new Error(`Could not mint a claim number for ${claimId}`);

    // Auto-match anonymous claims to a registered guarantee — never blocking.
    let claim = toClaim(updated);
    if (!claim.guaranteeId) {
      claim = await this.linkClaimToGuaranteeIfMatched(claimId);
    }
    return {
      claim,
      claimNumber,
      raNumber: claim.raNumber ?? null,
      trackingNumber: claim.trackingNumber ?? null,
    };
  }

  // --- v3: anonymous claim-first intake ---

  async createAnonymousClaim(input: CreateAnonymousClaimInput): Promise<Claim> {
    const { data } = await this.db
      .from("claims")
      .insert({
        guarantee_id: null,
        consumer_id: null,
        status: "draft",
        step: "intake",
        confirmations: [],
        pre_verified: false,
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        delivery_zip: input.deliveryZip.trim(),
        dealer_location_id: DEFAULT_DEALER_LOCATION_ID,
        submitted_at: null,
      })
      .select("*")
      .maybeSingle();
    return toClaim(data);
  }

  async getClaimByNumber(claimNumber: string): Promise<Claim | null> {
    const needle = claimNumberQuery(claimNumber);
    if (!needle) return null;
    const { data } = await this.db
      .from("claims")
      .select("*")
      .eq("claim_number", needle)
      .maybeSingle();
    return data ? toClaim(data) : null;
  }

  async linkClaimToGuaranteeIfMatched(claimId: string): Promise<Claim> {
    const claim = await this.getClaimById(claimId);
    if (!claim) throw new Error(`No claim ${claimId}`);
    // Already linked, or nothing to match on — leave it alone, never throw.
    if (claim.guaranteeId || !claim.lastName || !claim.deliveryZip) return claim;
    const { data: rows } = await this.db
      .from("guarantees")
      .select("*")
      .eq("customer_zip", claim.deliveryZip.trim());
    const match = matchGuarantee((rows ?? []).map(toGuarantee), {
      lastName: claim.lastName,
      deliveryZip: claim.deliveryZip,
      salesOrderNumber: claim.salesOrderNumber ?? null,
    });
    if (!match) return claim;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { guarantee_id: match.id };
    // Carry the linked account (when the guarantee has one) so ownership reads
    // resolve, mirroring linkGuaranteeToUser's backfill.
    if (!claim.consumerId && match.consumerId) patch.consumer_id = match.consumerId;
    const { data } = await this.db
      .from("claims")
      .update(patch)
      .eq("id", claimId)
      .select("*")
      .maybeSingle();
    return data ? toClaim(data) : claim;
  }

  async listClaimLinks(claimId: string): Promise<ClaimLink[]> {
    const { data } = await this.db
      .from("claim_links")
      .select("*")
      .eq("claim_id", claimId)
      .order("created_at", { ascending: true });
    return (data ?? []).map(toClaimLink);
  }

  async addClaimLink(claimId: string, input: AddClaimLinkInput): Promise<ClaimLink> {
    const claim = await this.getClaimById(claimId);
    if (!claim) throw new Error(`No claim ${claimId}`);
    const { data } = await this.db
      .from("claim_links")
      .insert({
        claim_id: claimId,
        kind: input.kind,
        url: input.url.trim(),
        label: input.label?.trim() || null,
        created_by: input.createdBy ?? null,
      })
      .select("*")
      .maybeSingle();
    return toClaimLink(data);
  }

  async updateClaimStatus(claimId: string, status: ClaimStatus): Promise<Claim> {
    const existing = await this.getClaimById(claimId);
    if (!existing) throw new Error(`No claim ${claimId}`);
    assertClaimStatusTransition(existing.status, status);
    // updated_at refreshes via the schema's touch trigger — not set here.
    const { data } = await this.db
      .from("claims")
      .update({ status })
      .eq("id", claimId)
      .select("*")
      .maybeSingle();
    return toClaim(data);
  }

  async recordExchangeSalesOrder(
    claimId: string,
    salesOrderNumber: string
  ): Promise<Claim> {
    const existing = await this.getClaimById(claimId);
    if (!existing) throw new Error(`No claim ${claimId}`);
    assertExchangeRecordable(existing.status, salesOrderNumber);
    const patch: Record<string, unknown> = {
      exchange_sales_order_number: salesOrderNumber.trim(),
    };
    if (existing.status !== "completed") {
      patch.status = "completed";
      patch.completed_at = new Date().toISOString();
    }
    const { data } = await this.db
      .from("claims")
      .update(patch)
      .eq("id", claimId)
      .select("*")
      .maybeSingle();
    return toClaim(data);
  }

  // --- M5b: the shop coupon ---

  async getActiveCoupon(guaranteeId: string): Promise<Coupon | null> {
    const { data } = await this.db
      .from("coupons")
      .select("*")
      .eq("guarantee_id", guaranteeId)
      .order("issued_at", { ascending: false })
      .limit(1);
    if (!data || !data[0]) return null;
    const coupon = toCoupon(data[0]);
    return isCouponExpired(coupon) ? null : coupon;
  }

  async issueCoupon(guaranteeId: string): Promise<Coupon> {
    // Idempotent: an unexpired code is already in the customer's hands.
    const active = await this.getActiveCoupon(guaranteeId);
    if (active) return active;

    const guarantee = await this.getGuaranteeById(guaranteeId);
    const dealer = await this.getDealerLocationForGuarantee(guaranteeId);
    const issuedAt = new Date().toISOString();
    const { data } = await this.db
      .from("coupons")
      .insert({
        guarantee_id: guaranteeId,
        dealer_location_id: guarantee?.dealerLocationId ?? null,
        code: generateCouponCode(),
        // Snapshot, not a live read — a later dealer change must not alter a
        // code already handed out.
        pct: dealer?.couponPct ?? null,
        issued_at: issuedAt,
        expires_at: couponExpiresAt(issuedAt),
      })
      .select("*")
      .maybeSingle();
    return toCoupon(data);
  }

  // --- M6: the user <-> guarantee link ---

  async getGuaranteeForUser(userId: string): Promise<Guarantee | null> {
    const needle = (userId ?? "").trim();
    if (!needle) return null;
    const { data } = await this.db
      .from("guarantees")
      .select("*")
      .eq("consumer_id", needle)
      .order("created_at", { ascending: false })
      .limit(1);
    return data && data[0] ? toGuarantee(data[0]) : null;
  }

  async listGuaranteesForUser(userId: string): Promise<Guarantee[]> {
    const needle = (userId ?? "").trim();
    if (!needle) return [];
    const { data } = await this.db
      .from("guarantees")
      .select("*")
      .eq("consumer_id", needle)
      .order("created_at", { ascending: false });
    return (data ?? []).map(toGuarantee);
  }

  async linkGuaranteeToUser(
    guaranteeId: string,
    userId: string,
    via: LinkVia
  ): Promise<Guarantee | null> {
    const existing = await this.getGuaranteeById(guaranteeId);
    if (!existing) return null;
    // A purchase belongs to exactly one account.
    if (existing.consumerId && existing.consumerId !== userId) return null;
    // The check above races the update (two accounts linking the same free
    // order at once). The service-role client bypasses RLS, so the write itself
    // must be the gate: only claim the row while it's still unowned OR already
    // ours (idempotent re-link). If a rival won the race, no row matches and we
    // return null rather than steal it.
    const { data } = await this.db
      .from("guarantees")
      .update({ consumer_id: userId, linked_via: via })
      .eq("id", guaranteeId)
      .or(`consumer_id.is.null,consumer_id.eq.${userId}`)
      .select("*")
      .maybeSingle();
    if (!data) return null;
    // Backfill any claims opened before the link so claims RLS resolves.
    await this.db
      .from("claims")
      .update({ consumer_id: userId })
      .eq("guarantee_id", guaranteeId)
      .is("consumer_id", null);
    return toGuarantee(data);
  }

  async listClaimRecords(
    scope: ClaimRecordScope,
    query?: string,
    filters?: ClaimRecordFilters
  ): Promise<ClaimRecord[]> {
    const needle = (query ?? "").trim();
    let read = this.db
      .from("claims")
      .select("*, guarantees!inner(*)")
      .neq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(needle ? CLAIM_SEARCH_LIMIT : 200);
    // The scope lives inside the read, never in the caller's UI.
    if (scope.kind === "dealer_location") {
      read = read.eq("guarantees.dealer_location_id", scope.dealerLocationId);
    }
    // Standard filters pushed into the query; claimRecordFilterMatches re-checks
    // below so both backends share one source of truth for the semantics.
    if (filters?.status) read = read.eq("status", filters.status);
    if (filters?.submittedFrom) read = read.gte("submitted_at", filters.submittedFrom);
    if (filters?.submittedTo) {
      // Inclusive plain-date upper bound over a timestamptz column.
      read = read.lt("submitted_at", nextDay(filters.submittedTo));
    }
    if (needle) {
      // ilike approximation of claimSearchMatches (lib/data/repository.ts):
      // exact-ish order/guarantee number/email, digits-only phone, plus name
      // partials per column (a substring spanning "First Last" is the one
      // case ilike can't express).
      const q = ilikeNeedle(needle);
      const parts = [
        `sales_order_number.ilike.${q}`,
        `guarantee_number.ilike.${q}`,
        `customer_email.ilike.${q}`,
        `customer_first_name.ilike.%${q}%`,
        `customer_last_name.ilike.%${q}%`,
      ];
      const digits = phoneDigits(needle);
      if (digits) parts.push(`customer_phone.eq.${digits}`);
      if (zipQuery(needle)) parts.push(`customer_zip.eq.${needle.trim()}`);
      read = read.or(parts.join(","), { referencedTable: "guarantees" });
    }
    const { data } = await read;
    let rows = data ?? [];
    // v3: a claim-number-shaped query also matches claims.claim_number. It
    // lives on the claim, not the guarantee, so PostgREST can't fold it into
    // the or() above — a second scoped read is merged in instead.
    const asClaimNumber = needle ? claimNumberQuery(needle) : null;
    if (asClaimNumber) {
      let byNumber = this.db
        .from("claims")
        .select("*, guarantees!inner(*)")
        .neq("status", "draft")
        .eq("claim_number", asClaimNumber);
      if (scope.kind === "dealer_location") {
        byNumber = byNumber.eq("guarantees.dealer_location_id", scope.dealerLocationId);
      }
      const { data: numberedRows } = await byNumber;
      const seen = new Set(rows.map((r: { id: string }) => r.id));
      rows = rows.concat(
        (numberedRows ?? []).filter((r: { id: string }) => !seen.has(r.id))
      );
    }
    return rows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((row: any) => toClaimRecord(toClaim(row), toGuarantee(row.guarantees)))
      .filter((record) => claimRecordFilterMatches(filters, record))
      .sort(byMostRecent);
  }

  async getClaimRecord(
    scope: ClaimRecordScope,
    claimId: string
  ): Promise<ClaimRecord | null> {
    let read = this.db
      .from("claims")
      .select("*, guarantees!inner(*)")
      .eq("id", claimId)
      // A draft is an in-progress fitting, not a request the desk can open.
      .neq("status", "draft");
    // Scope applied inside the query, so an out-of-scope claim never leaves
    // the database — indistinguishable from one that doesn't exist.
    if (scope.kind === "dealer_location") {
      read = read.eq("guarantees.dealer_location_id", scope.dealerLocationId);
    }
    const { data } = await read.maybeSingle();
    if (!data) return null;
    const guarantee = toGuarantee(data.guarantees);
    // Belt to the query's braces — the same check, in code.
    if (
      scope.kind === "dealer_location" &&
      guarantee.dealerLocationId !== scope.dealerLocationId
    ) {
      return null;
    }
    return toClaimRecord(toClaim(data), guarantee);
  }

  // --- Dealer desk: the claim-notes thread ---

  async listClaimNotes(claimId: string): Promise<ClaimNote[]> {
    const { data } = await this.db
      .from("claim_notes")
      .select("*, author:profiles(role)")
      .eq("claim_id", claimId)
      .order("created_at", { ascending: true });
    return (data ?? []).map(toClaimNote);
  }

  async addClaimNote(claimId: string, input: AddClaimNoteInput): Promise<ClaimNote> {
    const claim = await this.getClaimById(claimId);
    if (!claim) throw new Error(`No claim ${claimId}`);
    const { data } = await this.db
      .from("claim_notes")
      .insert({
        claim_id: claimId,
        author_id: input.authorId ?? null,
        body: input.body.trim(),
        // Part of the shared dealer <-> RAP thread — not an internal-only note
        // (is_internal=true is admin-only under the claim_notes RLS policy).
        is_internal: false,
      })
      .select("*")
      .maybeSingle();
    const note = toClaimNote(data);
    // The insert can't embed the profile; the resolved role is authoritative.
    return { ...note, author: input.author };
  }

  // --- M3: tips ---

  async getTip(query: TipQuery): Promise<Tip | null> {
    const tips = await this.listTips();
    return selectTip(tips, query);
  }

  // --- M3: concierge ---

  async getOrCreateConciergeThread(guaranteeId: string): Promise<ConciergeThread> {
    const { data } = await this.db
      .from("concierge_threads")
      .select("*")
      .eq("guarantee_id", guaranteeId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (data && data[0]) return toThread(data[0]);

    const { data: created } = await this.db
      .from("concierge_threads")
      .insert({ guarantee_id: guaranteeId })
      .select("*")
      .maybeSingle();
    return toThread(created);
  }

  async listConciergeMessages(threadId: string): Promise<ConciergeMessage[]> {
    const { data } = await this.db
      .from("concierge_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    return (data ?? []).map(toMessage);
  }

  async addConciergeMessage(
    threadId: string,
    role: ConciergeRole,
    body: string
  ): Promise<ConciergeMessage> {
    const { data } = await this.db
      .from("concierge_messages")
      .insert({ thread_id: threadId, role, body })
      .select("*")
      .maybeSingle();
    return toMessage(data);
  }

  // --- B-11: coach usage telemetry ---

  async recordConciergeUsage(input: ConciergeUsageInput): Promise<void> {
    await this.db.from("concierge_usage").insert({
      thread_id: input.threadId,
      model: input.model,
      api_calls: input.apiCalls,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cache_creation_tokens: input.cacheCreationTokens,
      cache_read_tokens: input.cacheReadTokens,
    });
  }

  async listConciergeUsageDaily(days = 30): Promise<ConciergeUsageDay[]> {
    const cutoff = new Date(Date.now() - days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const { data } = await this.db
      .from("concierge_usage_daily")
      .select("*")
      .gte("day", cutoff)
      .order("day", { ascending: false });
    return (data ?? []).map((r) => ({
      day: String(r.day).slice(0, 10),
      replies: r.replies ?? 0,
      apiCalls: r.api_calls ?? 0,
      inputTokens: r.input_tokens ?? 0,
      outputTokens: r.output_tokens ?? 0,
      cacheCreationTokens: r.cache_creation_tokens ?? 0,
      cacheReadTokens: r.cache_read_tokens ?? 0,
    }));
  }

  // --- B-13: settings + rate limiting + chat quotas ---

  async getAppSettings(): Promise<Record<string, number>> {
    const { data } = await this.db.from("app_settings").select("key, value");
    const out: Record<string, number> = {};
    for (const row of data ?? []) {
      const v = Number(row.value);
      if (Number.isFinite(v)) out[String(row.key)] = v;
    }
    return out;
  }

  async bumpRateCounter(bucket: string, key: string, windowStartIso: string): Promise<number> {
    // Atomic increment in one round-trip (see the bump_rate_counter SQL
    // function): insert-or-add-1, returning the new count. No count-then-insert
    // race across serverless instances.
    const { data, error } = await this.db.rpc("bump_rate_counter", {
      p_bucket: bucket,
      p_key: key,
      p_window_start: windowStartIso,
    });
    if (error) throw error;
    return Number(data);
  }

  async countConciergeRepliesSince(guaranteeId: string, sinceIso: string): Promise<number> {
    const { data: threads } = await this.db
      .from("concierge_threads")
      .select("id")
      .eq("guarantee_id", guaranteeId);
    const ids = (threads ?? []).map((t) => t.id);
    if (ids.length === 0) return 0;
    const { count } = await this.db
      .from("concierge_messages")
      .select("id", { count: "exact", head: true })
      .in("thread_id", ids)
      .eq("role", "assistant")
      .gte("created_at", sinceIso);
    return count ?? 0;
  }

  async countConciergeRepliesGlobalSince(sinceIso: string): Promise<number> {
    const { count } = await this.db
      .from("concierge_messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "assistant")
      .gte("created_at", sinceIso);
    return count ?? 0;
  }
}
