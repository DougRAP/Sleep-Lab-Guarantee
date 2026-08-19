// lib/shell.ts
// Which surfaces the app shell offers, per mode (v3, M-S3).
//
// Claims mode is the DEFAULT product now (spec v3 §1): the customer sees the
// guarantee, their requests and the shop. The companion layer — Tonight and the
// Coach — is hidden and *unreachable*, never deleted: one flag (isClaimsMode)
// gates it, and flipping NEXT_PUBLIC_CLAIMS_MODE="false" brings it all back.
//
// The rules live here rather than in the components so the middleware, the
// bottom nav and the tests all read the same answer (DEV-NOTES §10).

import { isClaimsMode } from "./demo";

/** Companion surfaces hidden — and unreachable — while claims mode is on. */
export const CLAIMS_HIDDEN_PREFIXES = ["/tonight", "/concierge"] as const;

/** Where a request for a hidden surface lands instead. */
export const CLAIMS_REDIRECT_PATH = "/guarantee";

/** Bottom-nav destinations, in bar order, for the full companion product. */
export const COMPANION_NAV_HREFS = [
  "/tonight",
  "/guarantee",
  "/requests",
  "/shop",
] as const;

/**
 * Bottom-nav destinations in claims mode: Guarantee · Requests · Shop. Shop
 * stays (Doug, 2026-08-18) — only the companion layer goes.
 */
export const CLAIMS_NAV_HREFS = ["/guarantee", "/requests", "/shop"] as const;

/** A path is "under" a prefix when it equals it or is a child of it. */
export function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when this path is one of the surfaces claims mode turns away. */
export function isHiddenInClaimsMode(
  pathname: string,
  claimsMode: boolean = isClaimsMode()
): boolean {
  if (!claimsMode) return false;
  return CLAIMS_HIDDEN_PREFIXES.some((prefix) => isUnder(pathname, prefix));
}

/** The bottom-nav destinations for the current mode, in bar order. */
export function navHrefs(
  claimsMode: boolean = isClaimsMode()
): readonly string[] {
  return claimsMode ? CLAIMS_NAV_HREFS : COMPANION_NAV_HREFS;
}

/**
 * Whether the Coach affordance exists at all — the bottom-nav segment, the
 * "Talk to your guide" link on Tonight, the admin usage report link.
 */
export function isCoachEnabled(claimsMode: boolean = isClaimsMode()): boolean {
  return !claimsMode;
}

/* -------------------------------------------------------------------------- */
/* R-1 — the app-wide footer (Aug 19 punch list)                              */
/* -------------------------------------------------------------------------- */

/**
 * Doug, 2026-08-19: "On the request page, it has a footer. But that's not
 * anywhere else. […] you could use that footer." The bar moved out of the
 * `app/(app)` route group and up to the root layout, so it is a property of the
 * app rather than of one folder.
 *
 * That alone would have made Emy's "stuck on Requests" finding WORSE: the bar
 * offers a destination, the page guard bounces you off it, and nothing explains
 * why. So the rules below answer three questions together — does the bar exist
 * on this surface, which tabs may it offer THIS visitor, and is what survives
 * actually worth showing — and the second one is derived from what each
 * destination requires rather than from a hand-kept list.
 */

/** What a visitor must be before a destination can render anything for them. */
export type NavRequirement = "signed-in" | "linked";

/** Every href the bar can ever offer, across both modes, plus the Coach. */
export type NavDestination =
  | (typeof COMPANION_NAV_HREFS)[number]
  | (typeof CLAIMS_NAV_HREFS)[number]
  | "/concierge";

/**
 * What each destination needs. This is the single lever: when R-6 teaches
 * /guarantee and /shop to render for an account with nothing linked, those two
 * entries relax to "signed-in" and NOTHING in this file changes.
 *
 * R-6 is one line HERE, not one line overall: it also has to move both pages
 * off requireGuarantee(), give each a real unlinked design (both dereference a
 * guarantee for the day count, the dealer and the coupon), take the header
 * email from the viewer instead of the session, and settle where an unlinked
 * account should land after auth. The lever is this table; the work is there.
 *
 * Typed by NavDestination on purpose: adding a tab without a requirement is a
 * compile error, not a silent grant.
 */
export const NAV_REQUIREMENTS: Readonly<Record<NavDestination, NavRequirement>> = {
  "/tonight": "linked",
  "/guarantee": "linked",
  "/requests": "signed-in",
  "/shop": "linked",
  "/concierge": "linked",
};

/** The staff desk. Consumer tabs have nothing to offer there. */
export const FOOTER_HIDDEN_PREFIXES = ["/admin"] as const;

/** The account screens. Every tab there would bounce straight back to login. */
export const FOOTER_AUTH_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/new-password",
] as const;

/**
 * Surfaces with no bar, whoever is looking. Exported because the pages that
 * reserve room for the bar, and the demo controls that sit above it, must read
 * the SAME answer rather than keeping their own copy of this list
 * (CLAUDE.md: surface visibility lives here, never in a component).
 *
 * Note /link is deliberately absent: a visitor there is already signed in, and
 * Requests is a real destination for them.
 */
export function footerHiddenSurface(pathname: string): boolean {
  return [...FOOTER_HIDDEN_PREFIXES, ...FOOTER_AUTH_PREFIXES].some((prefix) =>
    isUnder(pathname, prefix)
  );
}

/**
 * Everything the bar needs to know about who is looking at it. Resolved server
 * side (lib/auth/footer-visitor.ts) and passed in, so this stays free of
 * cookies: it never learns whether Supabase auth or the light-verify fallback
 * produced the answer.
 */
export interface FooterVisitor {
  authenticated: boolean;
  /** True when a purchase is linked AND still resolves in the repository. */
  linked: boolean;
  /** RAP admin or dealer. Their journey is the desk, not the consumer tabs. */
  staff: boolean;
}

/** What the bar renders. */
export interface FooterPlan {
  /** False renders nothing at all. */
  visible: boolean;
  /** Tab hrefs, in bar order, already filtered to what this visitor can reach. */
  hrefs: readonly string[];
  coach: boolean;
  /**
   * True when nothing here leads anywhere the visitor is not already, so the
   * bar carries the way to a person instead of dead tabs.
   */
  bare: boolean;
}

const NO_FOOTER: FooterPlan = { visible: false, hrefs: [], coach: false, bare: false };

/** Whether this visitor can actually land on a destination without a bounce. */
function canReach(requirement: NavRequirement, visitor: FooterVisitor): boolean {
  if (visitor.staff) return false;
  if (!visitor.authenticated) return false;
  return requirement === "linked" ? visitor.linked : true;
}

/** The requirement for an href. Unknown fails CLOSED — never a silent grant. */
function requirementFor(href: string): NavRequirement {
  return (NAV_REQUIREMENTS as Record<string, NavRequirement | undefined>)[href] ?? "linked";
}

/** Does the bar exist on this path, and what may it offer this visitor? */
export function footerPlan(
  pathname: string,
  visitor: FooterVisitor,
  claimsMode: boolean = isClaimsMode()
): FooterPlan {
  if (footerHiddenSurface(pathname)) return NO_FOOTER;
  // Staff off their own desk get no consumer chrome at all. Offering a RAP
  // agent the customer claims line would be absurd, and the tabs are already
  // denied to them by canReach.
  if (visitor.staff) return NO_FOOTER;

  const hrefs = navHrefs(claimsMode).filter((href) =>
    canReach(requirementFor(href), visitor)
  );
  const coach =
    isCoachEnabled(claimsMode) && canReach(requirementFor("/concierge"), visitor);

  // "Somewhere else to go" is the test, not "any tab at all": a lone tab
  // pointing at the page you are already on is chrome that does nothing, and
  // withholding the phone number from that visitor was exactly backwards.
  const elsewhere = hrefs.filter((href) => !isUnder(pathname, href));
  const bare = elsewhere.length === 0 && !coach;

  return { visible: true, hrefs, coach, bare };
}
