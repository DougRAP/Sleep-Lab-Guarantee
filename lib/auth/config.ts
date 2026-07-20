// lib/auth/config.ts
// The single switch for real authentication.
//
// Production has no Supabase keys yet, and this branch merges before they land.
// Real auth cannot work without Supabase, so everything auth-shaped asks this
// helper first: when it is false the app falls back to the original light-verify
// entry flow (sales order + last name -> signed cookie) and nothing dead-ends.
//
// Only the PUBLIC vars are checked, on purpose: this helper also runs inside the
// edge middleware, where NEXT_PUBLIC_* values are inlined at build time. The
// repository still needs SUPABASE_SERVICE_ROLE_KEY (see lib/data/index.ts) —
// in a correctly configured deployment all three are set together.

/** True when Supabase Auth can actually be used. */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Where a dashboard `?token=…` is parked between arrival and account creation.
 * The token pre-associates a purchase; it never signs anyone in on its own.
 */
export const PENDING_TOKEN_COOKIE = "rap_pending_token";

/** One hour is plenty to finish signing up from a dashboard link. */
export const PENDING_TOKEN_MAX_AGE = 60 * 60;

/** The light-verify session cookie (the no-Supabase fallback path). */
export const LIGHT_SESSION_COOKIE = "rap_session";

/** Minimum password length we ask for. Supabase's own default is 6. */
export const MIN_PASSWORD_LENGTH = 8;
