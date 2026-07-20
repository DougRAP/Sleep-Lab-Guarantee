// lib/actions/checkin.ts
// Server action for the nightly check-in (PRD §2a). Server-authoritative: reads
// the verified guarantee from the signed session and persists via the repo.

"use server";

import { getRepository } from "../data";
import { getAppSession } from "../auth/app-session";
import type { Feeling } from "../types";

export type CheckInResult = { ok: true } | { ok: false; error: string };

export async function logCheckIn(feeling: Feeling, note?: string): Promise<CheckInResult> {
  const session = await getAppSession();
  if (!session) return { ok: false, error: "Your session has ended. Please sign in again." };

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) return { ok: false, error: "We couldn't find your record." };

  await repo.saveCheckIn({ guaranteeId: guarantee.id, feeling, note: note ?? null });
  return { ok: true };
}
