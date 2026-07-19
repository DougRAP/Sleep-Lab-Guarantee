// lib/data/supabase-repository.ts
// Supabase-backed repository. Active when NEXT_PUBLIC_SUPABASE_URL is set.
// Uses the service-role client for server-authoritative reads/writes (the
// consumer has no auth user yet in v1 — light verify is a signed cookie).

import type {
  CheckIn,
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
import { selectTip, type TipQuery } from "../tips";
import { createServiceClient } from "../supabase/server";
import {
  type GuaranteeRepository,
  type SaveCheckInInput,
  type SaveConcernInput,
  type SaveInitialImpressionInput,
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
