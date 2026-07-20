// lib/auth/user.ts
// Reading the current Supabase auth user and their role. Server-only (pulls
// next/headers through the Supabase server client).
//
// Every read is defensive: if Supabase isn't configured, or a call throws, we
// return null rather than crashing. An unconfigured or unreachable auth backend
// must degrade to the light-verify fallback, never to a stack trace.

import { createClient, createServiceClient } from "../supabase/server";
import { isAuthConfigured } from "./config";
import type { Profile, Role } from "../types";

/** The authenticated person, with the role that gates admin/dealer surfaces. */
export interface Viewer {
  userId: string;
  email: string | null;
  role: Role;
  /** Set for the dealer role — scopes what they can see to their location. */
  dealerLocationId: string | null;
}

/** The Supabase auth user, verified against the auth server. Null if none. */
export async function getAuthUser(): Promise<{ id: string; email: string | null } | null> {
  if (!isAuthConfigured()) return null;
  try {
    const supabase = await createClient();
    // getUser() re-validates with the auth server; getSession() would trust the
    // cookie contents, which is not good enough for an authorization decision.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

/** The authenticated viewer with their profile role, or null. */
export async function getViewer(): Promise<Viewer | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const profile = await ensureProfile(user.id, user.email);
  return {
    userId: user.id,
    email: user.email,
    role: profile?.role ?? "consumer",
    dealerLocationId: profile?.dealerLocationId ?? null,
  };
}

/**
 * Read the profile row, creating a `consumer` one if it's missing. The schema
 * also installs an `on auth.users` trigger that does this; this is the belt to
 * that braces, so a user created before the trigger existed still works.
 */
export async function ensureProfile(
  userId: string,
  email: string | null
): Promise<Profile | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const db = createServiceClient();
    const { data } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) return toProfile(data);
    const { data: created } = await db
      .from("profiles")
      .insert({ id: userId, email, role: "consumer" })
      .select("*")
      .maybeSingle();
    return created ? toProfile(created) : null;
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toProfile(row: any): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: (row.role as Role) ?? "consumer",
    dealerLocationId: row.dealer_location_id ?? null,
    phone: row.phone,
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
