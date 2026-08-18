// lib/access-matrix.test.ts
// B-13 Pieza 8: the access matrix as executable truth. Each row is one visitor
// against the guarded surfaces; the expected redirect (or null = allowed) is
// asserted here and mirrored in misc/b13-security-guide.html. A change that
// loosens a permission breaks a row loudly instead of shipping silently.

import { describe, it, expect } from "vitest";
import {
  guardAppRoute,
  guardAdminRoute,
  guardLinkRoute,
  guardAuthRoute,
  type ViewerState,
} from "./auth/routing";
import { staffScope } from "./auth/staff-view";

// Production shape: Supabase configured. The unconfigured fallback is covered
// by the fields too, but the matrix documents the real deployment.
const V = (over: Partial<ViewerState>): ViewerState => ({
  authConfigured: true,
  authenticated: false,
  linked: false,
  role: null,
  hasLightSession: false,
  ...over,
});

const anon = V({});
const authUnlinked = V({ authenticated: true, role: "consumer" });
const consumer = V({ authenticated: true, role: "consumer", linked: true });
const dealer = V({ authenticated: true, role: "dealer" });
const admin = V({ authenticated: true, role: "rap_admin" });

describe("access matrix — consumer app routes (/tonight, /guarantee, ...)", () => {
  it("anonymous is sent to login", () => {
    expect(guardAppRoute(anon)).toBe("/login");
  });
  it("authenticated-but-unlinked consumer is sent to link", () => {
    expect(guardAppRoute(authUnlinked)).toBe("/link");
  });
  it("linked consumer is allowed", () => {
    expect(guardAppRoute(consumer)).toBeNull();
  });
  it("staff are pushed to their own desk, never the consumer journey", () => {
    expect(guardAppRoute(dealer)).toBe("/admin");
    expect(guardAppRoute(admin)).toBe("/admin");
  });
});

describe("access matrix — /admin", () => {
  it("anonymous is sent to login", () => {
    expect(guardAdminRoute(anon)).toBe("/login");
  });
  it("a consumer is bounced to their own home, never into the desk", () => {
    expect(guardAdminRoute(consumer)).toBe("/tonight");
    expect(guardAdminRoute(authUnlinked)).toBe("/link");
  });
  it("both staff roles are allowed", () => {
    expect(guardAdminRoute(dealer)).toBeNull();
    expect(guardAdminRoute(admin)).toBeNull();
  });
});

describe("access matrix — /link and /login|/signup", () => {
  it("link is for authenticated, unlinked consumers only", () => {
    expect(guardLinkRoute(anon)).toBe("/login");
    expect(guardLinkRoute(authUnlinked)).toBeNull();
    expect(guardLinkRoute(consumer)).toBe("/tonight");
    expect(guardLinkRoute(dealer)).toBe("/admin");
  });
  it("the auth screens turn away anyone already signed in", () => {
    expect(guardAuthRoute(anon)).toBeNull();
    expect(guardAuthRoute(consumer)).toBe("/tonight");
    expect(guardAuthRoute(admin)).toBe("/admin");
  });
});

describe("access matrix — staff DATA scope", () => {
  it("a dealer is hard-scoped to their own location; RAP sees all", () => {
    expect(staffScope({ role: "dealer", dealerLocationId: "101", demo: false, userId: "u", email: null }))
      .toEqual({ kind: "dealer_location", dealerLocationId: "101" });
    expect(staffScope({ role: "rap_admin", dealerLocationId: null, demo: false, userId: "u", email: null }))
      .toEqual({ kind: "all" });
    // A dealer with no location cannot widen to "all" by accident.
    expect(staffScope({ role: "dealer", dealerLocationId: null, demo: false, userId: "u", email: null }))
      .toEqual({ kind: "all" });
  });
});
