// lib/actions/impression.ts
// Server action for the one-time out-of-the-box first impression (Change 1).
// Server-authoritative: reads the verified guarantee from the signed session and
// persists via the repo — the client never chooses which guarantee to write.

"use server";

import { getRepository } from "../data";
import { getAppSession } from "../auth/app-session";
import type { InitialImpression } from "../types";

export type ImpressionResult = { ok: true } | { ok: false; error: string };

export async function recordInitialImpression(
  impression: InitialImpression,
  note?: string
): Promise<ImpressionResult> {
  const session = await getAppSession();
  if (!session) return { ok: false, error: "Your session has ended. Please sign in again." };

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) return { ok: false, error: "We couldn't find your record." };

  await repo.saveInitialImpression({
    guaranteeId: guarantee.id,
    impression,
    note: note?.trim() ? note.trim() : null,
  });
  return { ok: true };
}
