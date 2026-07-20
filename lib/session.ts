// lib/session.ts
// The LIGHT-VERIFY FALLBACK session: a signed, httpOnly cookie identifying the
// verified guarantee.
//
// This is no longer the app's authentication. Real accounts (Supabase Auth,
// email + password) took that over — see lib/auth/. This cookie is only minted
// and read when Supabase is NOT configured, so production and the demo keep
// working before the keys land. lib/auth/app-session.ts is what decides which
// of the two is live; nothing else should read this directly.
//
// Server-only (uses next/headers + node:crypto).

import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "rap_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** How the customer got in — a token link arrives pre-verified from the CRM. */
export type EntryVia = "token" | "lookup";

export interface SessionPayload {
  guaranteeId: string;
  iat: number;
  /**
   * Entry path. "token" means the sales order was pre-verified (they arrived on
   * the dashboard link), which is what lets the fitting skip the receipt photo.
   * Absent on sessions minted before M5 — treated as "lookup" (asks for it).
   */
  via?: EntryVia;
}

// (The pre-verified check now lives on the unified session — see
//  isPreVerifiedSession() in lib/auth/app-session.ts, which answers for both
//  the real-auth and the fallback path.)

function secret(): string {
  // Dev fallback keeps the local build/run working with no env. Set SESSION_SECRET
  // in any deployed environment.
  return process.env.SESSION_SECRET || "dev-insecure-session-secret-change-me";
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createSessionToken(guaranteeId: string, via: EntryVia = "lookup"): string {
  const payload: SessionPayload = { guaranteeId, iat: Date.now(), via };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload && typeof payload.guaranteeId === "string") {
      return payload as SessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setSession(
  guaranteeId: string,
  via: EntryVia = "lookup"
): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(guaranteeId, via), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
