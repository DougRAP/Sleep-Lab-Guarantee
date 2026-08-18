// lib/actions/select-guarantee.ts
// B-28: switch the active purchase for a multi-purchase account. Server-
// authoritative: the target must be one the account actually owns, so a forged
// id can never point the app at someone else's guarantee.

"use server";

import { getRepository } from "../data";
import { getViewer } from "../auth/user";
import { isAuthConfigured } from "../auth/config";
import { setActiveGuaranteeCookie } from "../active-guarantee";

export type SelectResult = { ok: boolean };

export async function selectGuaranteeAction(guaranteeId: string): Promise<SelectResult> {
  if (!isAuthConfigured()) return { ok: false };
  const viewer = await getViewer();
  if (!viewer) return { ok: false };

  const owned = await getRepository().listGuaranteesForUser(viewer.userId);
  if (!owned.some((g) => g.id === guaranteeId)) return { ok: false };

  await setActiveGuaranteeCookie(guaranteeId);
  return { ok: true };
}
