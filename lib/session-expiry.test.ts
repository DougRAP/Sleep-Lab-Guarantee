// lib/session-expiry.test.ts
// B-13 Pieza 6: the light-verify cookie now expires server-side (rolling TTL),
// not just in the browser. verifySessionToken enforces it. A valid signature is
// necessary but no longer sufficient — an old iat is rejected. sessionNeedsRefresh
// tells the caller when to re-mint so an active visitor never gets logged out.

import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  sessionNeedsRefresh,
  SESSION_TTL_SECONDS,
} from "./session";

describe("verifySessionToken — server-side expiry", () => {
  it("accepts a freshly minted token", () => {
    const t = createSessionToken("g-1", "lookup");
    expect(verifySessionToken(t)?.guaranteeId).toBe("g-1");
  });

  it("rejects a token whose iat is older than the TTL", () => {
    const old = createSessionToken("g-1", "lookup", Date.now() - (SESSION_TTL_SECONDS + 60) * 1000);
    expect(verifySessionToken(old)).toBeNull();
  });

  it("accepts a token right at the edge of the window", () => {
    const edge = createSessionToken("g-1", "lookup", Date.now() - (SESSION_TTL_SECONDS - 60) * 1000);
    expect(verifySessionToken(edge)?.guaranteeId).toBe("g-1");
  });

  it("still rejects a tampered signature (unchanged)", () => {
    const t = createSessionToken("g-1", "lookup");
    expect(verifySessionToken(t + "x")).toBeNull();
  });

  it("treats a legacy token with no iat as valid (transition safety)", () => {
    // Hand-forge a body with no iat, signed correctly, to prove old cookies are
    // not force-logged-out on deploy.
    const legacy = createLegacyToken("g-legacy");
    expect(verifySessionToken(legacy)?.guaranteeId).toBe("g-legacy");
  });
});

describe("sessionNeedsRefresh", () => {
  it("is true past the halfway mark, false when fresh", () => {
    expect(sessionNeedsRefresh({ guaranteeId: "g", iat: Date.now() })).toBe(false);
    const half = Date.now() - (SESSION_TTL_SECONDS / 2 + 60) * 1000;
    expect(sessionNeedsRefresh({ guaranteeId: "g", iat: half })).toBe(true);
  });

  it("is true for a legacy payload with no iat (re-mint it forward)", () => {
    expect(sessionNeedsRefresh({ guaranteeId: "g" })).toBe(true);
  });
});

// Mirror the token format without an iat, the way pre-B13 cookies looked.
import crypto from "node:crypto";
function createLegacyToken(guaranteeId: string): string {
  const body = Buffer.from(JSON.stringify({ guaranteeId, via: "lookup" })).toString("base64url");
  const secret = process.env.SESSION_SECRET || "dev-insecure-session-secret-change-me";
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}
