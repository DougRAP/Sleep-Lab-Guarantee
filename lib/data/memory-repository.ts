// lib/data/memory-repository.ts
// Local, zero-config fallback backed by lib/data/seed.ts. Lets the app run and
// both entry flows work with no Supabase keys, so M2 can be verified today.

import type { Guarantee, Journey, Tip } from "../types";
import { journeyDay, journeyPhase } from "../eligibility";
import {
  type GuaranteeRepository,
  type VerifyInput,
  lastNameMatches,
  sameCalendarDate,
} from "./repository";
import { SEED_GUARANTEES, SEED_TIPS } from "./seed";

export class MemoryRepository implements GuaranteeRepository {
  private guarantees: Guarantee[];
  private tips: Tip[];

  constructor(guarantees: Guarantee[] = SEED_GUARANTEES, tips: Tip[] = SEED_TIPS) {
    this.guarantees = guarantees;
    this.tips = tips;
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

  async hasResolvedExchange(_guaranteeId: string): Promise<boolean> {
    // No claims in the seed; the demo journey is always live/unresolved.
    void _guaranteeId;
    return false;
  }

  async listTips(): Promise<Tip[]> {
    return this.tips.filter((t) => t.active);
  }
}
