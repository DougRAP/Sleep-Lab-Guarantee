// lib/data/supabase-repository.ts
// Supabase-backed repository. Active when NEXT_PUBLIC_SUPABASE_URL is set.
// Uses the service-role client for server-authoritative reads (the consumer has
// no auth user yet in v1 — light verify is a signed cookie).

import type { Guarantee, Journey, Tip } from "../types";
import { journeyDay, journeyPhase } from "../eligibility";
import { createServiceClient } from "../supabase/server";
import {
  type GuaranteeRepository,
  type VerifyInput,
  lastNameMatches,
  sameCalendarDate,
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
}
