// lib/claim-session.test.ts
// The claimant cookie (v3 anonymous intake): sign/verify round-trip, tamper
// rejection, and the hard 7-day expiry — mirroring lib/session.ts's tests.

import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAIM_SESSION_TTL_SECONDS,
  createClaimToken,
  verifyClaimToken,
} from "./claim-session";

/** Sign with the dev fallback secret — what the suite runs under. */
function signedToken(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", "dev-insecure-session-secret-change-me")
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("claim token round-trip", () => {
  it("verifies what it signed", () => {
    const token = createClaimToken("claim-1");
    const payload = verifyClaimToken(token);
    expect(payload?.claimId).toBe("claim-1");
    expect(payload?.iat).toBe(Date.now());
  });

  it("rejects a tampered body", () => {
    const token = createClaimToken("claim-1");
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ claimId: "claim-2", iat: Date.now() }))
      .toString("base64url");
    expect(verifyClaimToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyClaimToken(`${body}.AAAA${sig!.slice(4)}`)).toBeNull();
  });

  it("rejects malformed and empty values", () => {
    expect(verifyClaimToken(null)).toBeNull();
    expect(verifyClaimToken(undefined)).toBeNull();
    expect(verifyClaimToken("")).toBeNull();
    expect(verifyClaimToken("not-a-token")).toBeNull();
    expect(verifyClaimToken("a.b.c")).toBeNull();
  });

  it("rejects a correctly signed payload with the wrong shape", () => {
    // iat is required on this cookie — no legacy no-iat grace like rap_session.
    expect(verifyClaimToken(signedToken({ claimId: "claim-1" }))).toBeNull();
    expect(verifyClaimToken(signedToken({ iat: Date.now() }))).toBeNull();
    expect(verifyClaimToken(signedToken({ claimId: 42, iat: Date.now() }))).toBeNull();
  });

  it("expires after 7 days, hard", () => {
    const token = createClaimToken("claim-1");
    vi.setSystemTime(
      new Date(Date.now() + (CLAIM_SESSION_TTL_SECONDS - 60) * 1000)
    );
    expect(verifyClaimToken(token)?.claimId).toBe("claim-1");

    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 1000));
    expect(verifyClaimToken(token)).toBeNull();
  });

  it("never verifies a guarantee-session token (different payload shape)", () => {
    // A rap_session-style payload has guaranteeId, not claimId — even a
    // correctly signed one must not become a claimant session.
    expect(
      verifyClaimToken(signedToken({ guaranteeId: "g-1", iat: Date.now() }))
    ).toBeNull();
  });
});
