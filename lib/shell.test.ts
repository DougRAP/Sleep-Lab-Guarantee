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
  NAV_REQUIREMENTS,
  footerHiddenSurface,
  footerPlan,
  isCoachEnabled,
  isHiddenInClaimsMode,
  navHrefs,
  type FooterVisitor,
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

/* -------------------------------------------------------------------------- */
/* R-1 — the app-wide footer                                                  */
/* -------------------------------------------------------------------------- */

// Doug, 2026-08-19: "On the request page, it has a footer. But that's not
// anywhere else. […] you could use that footer." The bar becomes a property of
// the app rather than of one route folder — but it must never offer a
// destination that would bounce the visitor, which is the root of Emy's
// "stuck on Requests" finding. Those two rules are asserted here.

const ANON: FooterVisitor = { authenticated: false, linked: false, staff: false };
const SIGNED_IN: FooterVisitor = { authenticated: true, linked: false, staff: false };
const LINKED: FooterVisitor = { authenticated: true, linked: true, staff: false };
const STAFF: FooterVisitor = { authenticated: true, linked: false, staff: true };

describe("footer surfaces — where the bar exists at all", () => {
  it("renders nothing on the staff desk", () => {
    for (const path of ["/admin", "/admin/requests/abc", "/admin/coach"]) {
      expect(footerPlan(path, STAFF, true).visible).toBe(false);
    }
  });

  it("renders nothing on the account screens", () => {
    for (const path of ["/login", "/signup", "/forgot-password", "/new-password"]) {
      expect(footerPlan(path, ANON, true).visible).toBe(false);
    }
  });

  it("does not match a path that merely starts with the same letters", () => {
    expect(footerPlan("/admins-choice", LINKED, true).visible).toBe(true);
    expect(footerPlan("/logins", LINKED, true).visible).toBe(true);
  });

  it("renders on every consumer surface, including the ones that had none", () => {
    for (const path of ["/", "/claim", "/fitting", "/guarantee", "/requests", "/shop"]) {
      expect(footerPlan(path, LINKED, true).visible).toBe(true);
    }
  });
});

describe("footer reachability — never offer a tab that would bounce you", () => {
  it("offers no tabs at all to an anonymous visitor on the claim journey", () => {
    for (const path of ["/", "/claim"]) {
      const plan = footerPlan(path, ANON, true);
      expect(plan.visible).toBe(true);
      expect(plan.hrefs).toEqual([]);
      expect(plan.coach).toBe(false);
    }
  });

  it("gives a linked account the full claims set", () => {
    expect(footerPlan("/guarantee", LINKED, true).hrefs).toEqual([
      "/guarantee",
      "/requests",
      "/shop",
    ]);
  });

  it("withholds Guarantee and Shop from an account with nothing linked (Emy, E-4)", () => {
    const plan = footerPlan("/requests", SIGNED_IN, true);
    expect(plan.hrefs).toEqual(["/requests"]);
    expect(plan.hrefs).not.toContain("/guarantee");
    expect(plan.hrefs).not.toContain("/shop");
  });

  it("offers a staff viewer no consumer destinations", () => {
    expect(footerPlan("/requests", STAFF, true).hrefs).toEqual([]);
  });

  it("leaves the companion product intact for a linked visitor", () => {
    const plan = footerPlan("/tonight", LINKED, false);
    expect(plan.hrefs).toEqual(["/tonight", "/guarantee", "/requests", "/shop"]);
    expect(plan.coach).toBe(true);
  });

  it("withholds the Coach from a companion visitor with nothing linked", () => {
    expect(footerPlan("/requests", SIGNED_IN, false).coach).toBe(false);
  });

  it("reads the env-backed mode default like every other rule here", () => {
    expect(footerPlan("/requests", LINKED).hrefs).toEqual([
      "/guarantee",
      "/requests",
      "/shop",
    ]);
  });
});

describe("footer requirements — the single lever R-6 will pull", () => {
  it("states what each destination needs, so relaxing one is a one-line change", () => {
    expect(NAV_REQUIREMENTS["/requests"]).toBe("signed-in");
    expect(NAV_REQUIREMENTS["/guarantee"]).toBe("linked");
    expect(NAV_REQUIREMENTS["/shop"]).toBe("linked");
  });

  it("covers every destination the nav can offer, in both modes", () => {
    // The map is typed by NavDestination, so an omission is a compile error.
    // This guards the other direction: a tuple gaining an href the type does
    // not know about would slip past the compiler and fail closed at runtime.
    const known = Object.keys(NAV_REQUIREMENTS);
    for (const href of [...navHrefs(true), ...navHrefs(false)]) {
      expect(known).toContain(href);
    }
  });
});

describe("footer — the consensus review's findings (5-agent pass)", () => {
  it("exposes the surface rule on its own, so nothing mirrors it by hand", () => {
    expect(footerHiddenSurface("/admin")).toBe(true);
    expect(footerHiddenSurface("/admin/requests/abc")).toBe(true);
    expect(footerHiddenSurface("/login")).toBe(true);
    expect(footerHiddenSurface("/new-password")).toBe(true);
    // /link is NOT an account screen: a visitor there is signed in already.
    expect(footerHiddenSurface("/link")).toBe(false);
    expect(footerHiddenSurface("/")).toBe(false);
    expect(footerHiddenSurface("/claim")).toBe(false);
  });

  it("falls back to the support bar when the only tab left is where you are", () => {
    // An unlinked account on /requests: offering a tab to the page you are
    // already on is the "chrome that does nothing" the bare bar exists to
    // prevent, and it withheld the phone number from Emy's exact visitor.
    const plan = footerPlan("/requests", SIGNED_IN, true);
    expect(plan.hrefs).toEqual(["/requests"]);
    expect(plan.bare).toBe(true);
  });

  it("still shows the strip when there is somewhere else to go", () => {
    expect(footerPlan("/requests", LINKED, true).bare).toBe(false);
    expect(footerPlan("/guarantee", LINKED, true).bare).toBe(false);
  });

  it("gives staff no bar at all, not a customer support line", () => {
    // "Call the claims line" is absurd chrome for a RAP agent.
    expect(footerPlan("/requests", STAFF, true).visible).toBe(false);
    expect(footerPlan("/", STAFF, true).visible).toBe(false);
  });

  it("keeps the Coach in the same table as every other destination", () => {
    expect(NAV_REQUIREMENTS["/concierge"]).toBe("linked");
  });
});
