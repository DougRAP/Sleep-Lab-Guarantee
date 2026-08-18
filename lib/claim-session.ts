// lib/claim-session.ts
// The CLAIMANT session for the v3 anonymous intake (spec §3): a signed,
// httpOnly cookie naming the draft claim, so a customer can leave the flow and
// resume without any account. Same HMAC machinery as lib/session.ts, its own
// cookie name and payload — the two sessions never mix, and requireGuarantee()
// is never involved in this flow.
//
// Server-only (uses next/headers + node:crypto).

import crypto from "node:crypto";
import { cookies } from "next/headers";

export const CLAIM_COOKIE_NAME = "rap_claim";
/** 7 days from mint — the same window the light-verify session uses. */
export const CLAIM_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface ClaimSessionPayload {
  claimId: string;
  /** Mint time (ms). */
  iat: number;
}

/** The known public placeholder — never valid to sign with in production. */
const INSECURE_DEFAULT = "dev-insecure-session-secret-change-me";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  // Same fail-closed rule as lib/session.ts (audit 2026-07-28): this cookie is
  // only as safe as the secret — refuse the public default in production.
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

export function createClaimToken(claimId: string, iat: number = Date.now()): string {
  const payload: ClaimSessionPayload = { claimId, iat };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyClaimToken(
  token: string | undefined | null
): ClaimSessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload.claimId !== "string") return null;
    if (typeof payload.iat !== "number") return null;
    const ageSeconds = (Date.now() - payload.iat) / 1000;
    if (ageSeconds > CLAIM_SESSION_TTL_SECONDS) return null;
    return payload as ClaimSessionPayload;
  } catch {
    return null;
  }
}

export async function setClaimSession(claimId: string): Promise<void> {
  const store = await cookies();
  store.set(CLAIM_COOKIE_NAME, createClaimToken(claimId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CLAIM_SESSION_TTL_SECONDS,
  });
}

export async function getClaimSession(): Promise<ClaimSessionPayload | null> {
  const store = await cookies();
  return verifyClaimToken(store.get(CLAIM_COOKIE_NAME)?.value);
}

export async function clearClaimSession(): Promise<void> {
  const store = await cookies();
  store.delete(CLAIM_COOKIE_NAME);
}
