// lib/shell.test.ts
// The v3 shell cutover (M-S3). Claims mode is the DEFAULT product now, so the
// rules that decide which surfaces exist are asserted here rather than read off
// a component: the bottom nav, the middleware and the page guards all answer
// from lib/shell.ts, and this file is what says what those answers must be.

import { afterEach, describe, expect, it, vi } from "vitest";
import { isClaimsMode } from "./demo";
import {
  CLAIMS_HIDDEN_PREFIXES,
  CLAIMS_REDIRECT_PATH,
  isCoachEnabled,
  isHiddenInClaimsMode,
  navHrefs,
} from "./shell";

describe("the mode default (v3): claims unless someone opts out", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is on with the env unset — Netlify no longer needs the var", () => {
    expect(isClaimsMode()).toBe(true);
  });

  it("is off only for an explicit NEXT_PUBLIC_CLAIMS_MODE=false", () => {
    vi.stubEnv("NEXT_PUBLIC_CLAIMS_MODE", "false");
    expect(isClaimsMode()).toBe(false);
  });

  it("still accepts the old opt-in value harmlessly", () => {
    vi.stubEnv("NEXT_PUBLIC_CLAIMS_MODE", "true");
    expect(isClaimsMode()).toBe(true);
  });
});

describe("bottom nav — Guarantee · Requests · Shop in claims mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("shows exactly the three claims destinations, in bar order", () => {
    expect(navHrefs(true)).toEqual(["/guarantee", "/requests", "/shop"]);
  });

  it("keeps Shop — only the companion layer goes (Doug 2026-08-18)", () => {
    expect(navHrefs(true)).toContain("/shop");
  });

  it("drops Tonight and offers no Coach", () => {
    expect(navHrefs(true)).not.toContain("/tonight");
    expect(isCoachEnabled(true)).toBe(false);
  });

  it("leaves the companion product exactly as it was", () => {
    expect(navHrefs(false)).toEqual(["/tonight", "/guarantee", "/requests", "/shop"]);
    expect(isCoachEnabled(false)).toBe(true);
  });

  it("reads the env-backed default: the three claims tabs", () => {
    expect(navHrefs()).toEqual(["/guarantee", "/requests", "/shop"]);
    expect(isCoachEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_CLAIMS_MODE", "false");
    expect(navHrefs()).toContain("/tonight");
    expect(isCoachEnabled()).toBe(true);
  });
});

describe("hidden surfaces — the Coach and Tonight are unreachable, not just unlinked", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("turns away /concierge and its children", () => {
    expect(isHiddenInClaimsMode("/concierge", true)).toBe(true);
    expect(isHiddenInClaimsMode("/concierge/anything", true)).toBe(true);
  });

  it("turns away /tonight", () => {
    expect(isHiddenInClaimsMode("/tonight", true)).toBe(true);
  });

  it("lets /shop through — it is part of the claims product", () => {
    expect(isHiddenInClaimsMode("/shop", true)).toBe(false);
    expect(CLAIMS_HIDDEN_PREFIXES).not.toContain("/shop");
  });

  it("never touches the claims surfaces themselves", () => {
    for (const path of ["/", "/claim", "/guarantee", "/guarantee/help", "/requests", "/fitting"]) {
      expect(isHiddenInClaimsMode(path, true)).toBe(false);
    }
  });

  it("does not match a path that merely starts with the same letters", () => {
    expect(isHiddenInClaimsMode("/tonights-tips", true)).toBe(false);
  });

  it("hides nothing at all in the companion product", () => {
    expect(isHiddenInClaimsMode("/concierge", false)).toBe(false);
    expect(isHiddenInClaimsMode("/tonight", false)).toBe(false);
  });

  it("sends a hidden request to the guarantee, the claims-mode home", () => {
    expect(CLAIMS_REDIRECT_PATH).toBe("/guarantee");
  });

  it("reads the env-backed default, so the middleware needs no flag of its own", () => {
    expect(isHiddenInClaimsMode("/concierge")).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_CLAIMS_MODE", "false");
    expect(isHiddenInClaimsMode("/concierge")).toBe(false);
  });
});
