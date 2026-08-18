// lib/auth/app-session.ts
// The one gate every consumer page and server action shares.
//
// Resolves "who is this, and which guarantee are they allowed to see?" against
// whichever authentication is actually live:
//
//   Supabase configured  -> the Supabase auth session is the authentication,
//                           and the guarantee is whichever row is linked to
//                           auth.uid() (guarantees.consumer_id).
//   Supabase absent      -> the original light-verify signed cookie, so the
//                           demo and production keep working before keys land.
//
// Server-only.

import { redirect } from "next/navigation";
import { getRepository } from "../data";
import { getSession } from "../session";
import { getViewer } from "./user";
import { isAuthConfigured } from "./config";
import { ADMIN_PATH, ENTRY_PATH, LINK_PATH, LOGIN_PATH, isStaff } from "./routing";
import { readActiveGuaranteeId, resolveActiveGuarantee } from "../active-guarantee";
import type { Guarantee, LinkVia, Role } from "../types";

/**
 * B-28: the active purchase for a real-auth account, honoring the selection
 * cookie and defaulting to the most recent. Returns null when nothing is linked.
 */
async function activeGuaranteeFor(userId: string): Promise<Guarantee | null> {
  const owned = await getRepository().listGuaranteesForUser(userId);
  return resolveActiveGuarantee(owned, await readActiveGuaranteeId());
}

/** The resolved session. `userId` is null on the light-verify fallback path. */
export interface AppSession {
  guaranteeId: string;
  via: LinkVia;
  userId: string | null;
  role: Role | null;
  /** The signed-in email for the header identity; null on light-verify. */
  email: string | null;
}

/** True when the sales order was pre-verified (arrived on a dashboard link). */
export function isPreVerifiedSession(session: AppSession | null): boolean {
  return session?.via === "token";
}

/**
 * The current session, or null. Never redirects — server actions use this so
 * they can return a calm message instead of throwing a navigation.
 */
export async function getAppSession(): Promise<AppSession | null> {
  if (!isAuthConfigured()) {
    const light = await getSession();
    if (!light) return null;
    return {
      guaranteeId: light.guaranteeId,
      via: light.via ?? "lookup",
      userId: null,
      role: null,
      email: null,
    };
  }

  const viewer = await getViewer();
  if (!viewer) return null;
  const guarantee = await activeGuaranteeFor(viewer.userId);
  if (!guarantee) return null;
  return {
    guaranteeId: guarantee.id,
    via: guarantee.linkedVia ?? "lookup",
    userId: viewer.userId,
    role: viewer.role,
    email: viewer.email,
  };
}

/**
 * Session + guarantee for a consumer page, or a calm redirect to wherever the
 * visitor actually needs to be (create an account, log in, or link a purchase).
 */
export async function requireGuarantee(): Promise<{
  session: AppSession;
  guarantee: Guarantee;
}> {
  const repo = getRepository();

  // --- Fallback: no Supabase, so light verify is the authentication ---
  if (!isAuthConfigured()) {
    const light = await getSession();
    if (!light) redirect(ENTRY_PATH);
    const guarantee = await repo.getGuaranteeById(light.guaranteeId);
    if (!guarantee) redirect(ENTRY_PATH);
    return {
      session: {
        guaranteeId: guarantee.id,
        via: light.via ?? "lookup",
        userId: null,
        role: null,
        email: null,
      },
      guarantee,
    };
  }

  // --- Real auth ---
  const viewer = await getViewer();
  if (!viewer) redirect(LOGIN_PATH);

  const guarantee = await activeGuaranteeFor(viewer.userId);
  if (!guarantee) redirect(isStaff(viewer.role) ? ADMIN_PATH : LINK_PATH);

  return {
    session: {
      guaranteeId: guarantee.id,
      via: guarantee.linkedVia ?? "lookup",
      userId: viewer.userId,
      role: viewer.role,
      email: viewer.email,
    },
    guarantee,
  };
}
