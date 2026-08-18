// lib/auth/routing.ts
// Pure routing decisions for the entry / link / return journey. Kept free of
// next/headers and Supabase so the rules are directly testable and so the same
// answers are used by the middleware, the page guards, and the server actions.
//
// The journey the product owner asked for:
//   first open (with or without a dashboard token) -> create an account
//   after authentication                            -> link the purchase
//   returning                                       -> log in, then /tonight
//
// A dashboard token never bypasses account creation. Guessing a sales order
// number grants nothing on its own — linking is an action an already
// authenticated user performs.

import type { Role } from "../types";
import { isClaimsMode } from "../demo";

export const ENTRY_PATH = "/";
export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
export const LINK_PATH = "/link";
export const HOME_PATH = "/tonight";
export const CLAIMS_HOME_PATH = "/guarantee";
/**
 * v3 (M-S5): the signed-in home for an account with NOTHING linked — an
 * account exists to track requests, so unlinked users land on the tracking
 * list (which works with zero guarantees) instead of bouncing off /link
 * forever (Doug hit that dead-end live, 2026-08-18).
 */
export const REQUESTS_PATH = "/requests";
export const ADMIN_PATH = "/admin";

/**
 * Where a linked consumer lands. Normally /tonight; in the claims-mode demo cut
 * the companion layer is hidden, so home is the guarantee. The parameter keeps
 * the decision pure/testable — callers rely on the env-backed default.
 */
export function homePath(claimsMode: boolean = isClaimsMode()): string {
  return claimsMode ? CLAIMS_HOME_PATH : HOME_PATH;
}

/** Everything a routing decision needs to know about the current visitor. */
export interface ViewerState {
  /** False when Supabase isn't configured — the light-verify fallback is live. */
  authConfigured: boolean;
  /** True when there is a real Supabase auth user. */
  authenticated: boolean;
  /** True when that user has a guarantee linked to them. */
  linked: boolean;
  role: Role | null;
  /** The legacy signed cookie. Only consulted in the unconfigured fallback. */
  hasLightSession: boolean;
}

/** RAP staff and dealers land on the admin surface, not the consumer journey. */
export function isStaff(role: Role | null | undefined): boolean {
  return role === "rap_admin" || role === "dealer";
}

/** Where to send someone the moment they authenticate (or already are). */
export function routeAfterAuth(state: ViewerState): string {
  if (!state.authConfigured) return ENTRY_PATH;
  if (!state.authenticated) return LOGIN_PATH;
  if (isStaff(state.role)) return ADMIN_PATH;
  // v3 (M-S5): nothing linked is fine — the tracking list is home, and it
  // offers the link step (which stays reachable and skippable) from there.
  return state.linked ? homePath() : REQUESTS_PATH;
}

/**
 * Guard for the consumer app routes (/tonight, /guarantee, /requests, /shop,
 * /concierge, /fitting). Returns a path to redirect to, or null to allow.
 */
export function guardAppRoute(state: ViewerState): string | null {
  // No Supabase: the original light-verify flow is the authentication.
  if (!state.authConfigured) return state.hasLightSession ? null : ENTRY_PATH;
  if (!state.authenticated) return LOGIN_PATH;
  if (state.linked) return null;
  // Authenticated but nothing linked: staff have no journey; consumers go to
  // the tracking list (their unlinked home, v3 M-S5), never a /link bounce.
  return isStaff(state.role) ? ADMIN_PATH : REQUESTS_PATH;
}

/** Guard for /link — the post-authentication "find your purchase" step. */
export function guardLinkRoute(state: ViewerState): string | null {
  if (!state.authConfigured) return ENTRY_PATH;
  if (!state.authenticated) return LOGIN_PATH;
  if (state.linked) return homePath();
  if (isStaff(state.role)) return ADMIN_PATH;
  return null;
}

/**
 * Guard for /admin. When Supabase isn't configured there is no way to prove a
 * role, so the page itself renders a calm "not switched on yet" state rather
 * than bouncing into a login that cannot work — hence null.
 */
export function guardAdminRoute(state: ViewerState): string | null {
  if (!state.authConfigured) return null;
  if (!state.authenticated) return LOGIN_PATH;
  if (isStaff(state.role)) return null;
  // A consumer who wandered in: send them somewhere useful, never an error.
  return state.linked ? homePath() : REQUESTS_PATH;
}

/** Guard for /login and /signup — an authenticated visitor doesn't need them. */
export function guardAuthRoute(state: ViewerState): string | null {
  if (!state.authConfigured) return ENTRY_PATH;
  if (state.authenticated) return routeAfterAuth(state);
  return null;
}
