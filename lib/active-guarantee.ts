// lib/active-guarantee.ts
// B-28: an account can hold several purchases (Doug 2026-07-27, "no limit to
// number of sales orders per customer"). This resolves WHICH one the consumer
// app is currently showing, and persists the choice in a small cookie. The
// resolution is pure and tested; the cookie helpers are the only server bits.
//
// Server-only where the cookie helpers are used (they pull next/headers).

import { cookies } from "next/headers";
import type { Guarantee } from "./types";

const ACTIVE_COOKIE = "rap_active_guarantee";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * The active purchase: the selected one when the account owns it, otherwise the
 * most recent (the list is passed most-recent first). Never returns a guarantee
 * outside the account's own list, so a stale/forged cookie can't cross accounts.
 */
export function resolveActiveGuarantee(
  owned: Guarantee[],
  selectedId: string | undefined
): Guarantee | null {
  if (owned.length === 0) return null;
  if (selectedId) {
    const match = owned.find((g) => g.id === selectedId);
    if (match) return match;
  }
  return owned[0];
}

/** The selected guarantee id from the cookie, if any. */
export async function readActiveGuaranteeId(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACTIVE_COOKIE)?.value || undefined;
}

/** Persist the active choice. Caller must have verified ownership first. */
export async function setActiveGuaranteeCookie(guaranteeId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_COOKIE, guaranteeId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
