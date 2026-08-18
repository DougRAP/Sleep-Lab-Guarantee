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
