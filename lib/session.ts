// lib/session.ts
// Minimal signed, httpOnly session identifying the verified guarantee. Full auth
// (Supabase magic-token) is a later milestone; a signed cookie is sufficient now.
// Server-only (uses next/headers + node:crypto).

import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "rap_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  guaranteeId: string;
  iat: number;
}

function secret(): string {
  // Dev fallback keeps the local build/run working with no env. Set SESSION_SECRET
  // in any deployed environment.
  return process.env.SESSION_SECRET || "dev-insecure-session-secret-change-me";
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createSessionToken(guaranteeId: string): string {
  const payload: SessionPayload = { guaranteeId, iat: Date.now() };
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

export async function setSession(guaranteeId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(guaranteeId), {
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
