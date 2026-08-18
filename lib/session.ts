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
/**
 * B-13 Pieza 6: rolling TTL, enforced server-side (not just the browser maxAge).
 * 7 days from the last visit. An active customer is re-minted on each visit
 * (see sessionNeedsRefresh), so they never get logged out; only a genuinely
 * idle session past the window is rejected. Legacy cookies with no iat are
 * accepted and re-minted forward, so deploying this never signs anyone out.
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MAX_AGE_SECONDS = SESSION_TTL_SECONDS;

/** How the customer got in — a token link arrives pre-verified from the CRM. */
export type EntryVia = "token" | "lookup";

export interface SessionPayload {
  guaranteeId: string;
  /** Mint time (ms). Optional: legacy pre-B13 cookies had none. */
  iat?: number;
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

/** The known public placeholder — never valid to sign with in production. */
const INSECURE_DEFAULT = "dev-insecure-session-secret-change-me";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  // Audit 2026-07-28: fail closed in production. The light-verify cookie is only
  // as safe as this secret — a missing or public one lets anyone forge a session
  // for any guarantee. Refuse to sign with the dev default rather than ship a
  // forgeable cookie. Dev/test/e2e (next dev) keep the fallback so local runs
  // and the in-memory suite never break.
  if (process.env.NODE_ENV === "production" && (!s || s === INSECURE_DEFAULT)) {
    throw new Error(
      "SESSION_SECRET must be set to a strong, non-default value in production."
    );
  }
  return s || INSECURE_DEFAULT;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createSessionToken(
  guaranteeId: string,
  via: EntryVia = "lookup",
  iat: number = Date.now()
): string {
  const payload: SessionPayload = { guaranteeId, iat, via };
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
    if (!payload || typeof payload.guaranteeId !== "string") return null;
    // B-13: server-side expiry. A legacy cookie with no iat predates this and
    // is accepted (it gets re-minted with a fresh iat on the next setSession).
    if (typeof payload.iat === "number") {
      const ageSeconds = (Date.now() - payload.iat) / 1000;
      if (ageSeconds > SESSION_TTL_SECONDS) return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * True when a valid session is past the halfway mark of its TTL (or is a legacy
 * cookie with no iat). The caller re-mints it so an active visitor's window
 * keeps rolling forward and they never hit the hard expiry.
 */
export function sessionNeedsRefresh(payload: SessionPayload): boolean {
  if (typeof payload.iat !== "number") return true;
  const ageSeconds = (Date.now() - payload.iat) / 1000;
  return ageSeconds > SESSION_TTL_SECONDS / 2;
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
  const payload = verifySessionToken(store.get(COOKIE_NAME)?.value);
  if (!payload) return null;

  // B-13 Pieza 6: roll the window forward for an active visitor (or upgrade a
  // legacy no-iat cookie). Writing a cookie is only legal in an action/route
  // handler; during a server-component render it throws, so we swallow that —
  // the session stays valid, it just isn't extended on this particular read.
  if (sessionNeedsRefresh(payload)) {
    try {
      store.set(COOKIE_NAME, createSessionToken(payload.guaranteeId, payload.via), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: MAX_AGE_SECONDS,
      });
    } catch {
      // Render context — cannot set cookies here; fine, refresh happens on the
      // next action/route-handler read.
    }
  }
  return payload;
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
