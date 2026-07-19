// lib/data/supabase-repository.ts
// Supabase-backed repository. Active when NEXT_PUBLIC_SUPABASE_URL is set.
// Uses the service-role client for server-authoritative reads/writes (the
// consumer has no auth user yet in v1 — light verify is a signed cookie).

import type {
  CheckIn,
  Claim,
  ClaimItem,
  ClaimPhoto,
  ConciergeMessage,
  ConciergeRole,
  ConciergeThread,
  DealerLocation,
  Guarantee,
  InitialImpressionRecord,
  Journey,
  Tip,
} from "../types";
import { journeyDay, journeyPhase } from "../eligibility";
import { generateRaNumber, generateTrackingNumber } from "../ra";
import { MAX_ITEMS, normalizeConfirmations } from "../fitting";
import { selectTip, type TipQuery } from "../tips";
import { createServiceClient } from "../supabase/server";
import {
  type ClaimItemInput,
  type CreateDraftClaimInput,
  type GuaranteeRepository,
  type RecordClaimPhotoInput,
  type SaveCheckInInput,
  type SaveConcernInput,
  type SaveInitialImpressionInput,
  type SubmitClaimResult,
  type UpdateClaimInput,
  type VerifyInput,
  lastNameMatches,
  sameCalendarDate,
  todayIso,
} from "./repository";

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
    dealerName: row.dealer_name,
    dealerLocationId: row.dealer_location_id,
    manufacturer: row.manufacturer,
    oemModel: row.oem_model,
    productDescription: row.product_description,
    purchasePrice: row.purchase_price,
    deliveryDate: String(row.delivery_date).slice(0, 10),
    accessToken: row.access_token,
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
    guaranteeId: row.guarantee_id,
    consumerId: row.consumer_id,
    status: row.status,
    raNumber: row.ra_number,
    trackingNumber: row.tracking_number,
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
    const { data } = await this.db
      .from("claims")
      .insert({
        guarantee_id: input.guaranteeId,
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

  async submitClaim(claimId: string): Promise<SubmitClaimResult> {
    const existing = await this.getClaimById(claimId);
    if (existing?.raNumber && existing.trackingNumber) {
      return {
        claim: existing,
        raNumber: existing.raNumber,
        trackingNumber: existing.trackingNumber,
      };
    }
    const raNumber = generateRaNumber();
    const trackingNumber = generateTrackingNumber();
    const { data } = await this.db
      .from("claims")
      .update({
        ra_number: raNumber,
        tracking_number: trackingNumber,
        status: "submitted",
        step: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", claimId)
      .select("*")
      .maybeSingle();
    return { claim: toClaim(data), raNumber, trackingNumber };
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
}
