// lib/data/memory-repository.ts
// Local, zero-config fallback backed by lib/data/seed.ts. Lets the app run and
// every flow work with no Supabase keys, so M3 can be verified today. State
// (check-ins, concierge threads/messages) lives in memory for the process
// lifetime — getRepository() caches a single instance, so it persists across
// requests during a dev session.

import type {
  CheckIn,
  ConciergeMessage,
  ConciergeRole,
  ConciergeThread,
  Guarantee,
  Journey,
  Tip,
} from "../types";
import { journeyDay, journeyPhase } from "../eligibility";
import { selectTip, type TipQuery } from "../tips";
import {
  type GuaranteeRepository,
  type SaveCheckInInput,
  type VerifyInput,
  lastNameMatches,
  sameCalendarDate,
  todayIso,
} from "./repository";
import { SEED_GUARANTEES, SEED_TIPS } from "./seed";

export class MemoryRepository implements GuaranteeRepository {
  private guarantees: Guarantee[];
  private tips: Tip[];
  private checkIns: CheckIn[] = [];
  private threads: ConciergeThread[] = [];
  private messages: ConciergeMessage[] = [];
  private seq = 0;

  constructor(guarantees: Guarantee[] = SEED_GUARANTEES, tips: Tip[] = SEED_TIPS) {
    this.guarantees = guarantees;
    this.tips = tips;
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

  async hasResolvedExchange(_guaranteeId: string): Promise<boolean> {
    // No claims in the seed; the demo journey is always live/unresolved.
    void _guaranteeId;
    return false;
  }

  async listTips(): Promise<Tip[]> {
    return this.tips.filter((t) => t.active);
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
