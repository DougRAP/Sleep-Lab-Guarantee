// lib/actions/auth.ts
// Server actions for real accounts: sign up, log in, log out, password reset,
// and linking a purchase to the signed-in account.
//
// Email confirmation is OFF for now (product owner's call), so sign-up returns
// a session immediately. Nothing here assumes that: if confirmation is switched
// on in Supabase later, signUp comes back without a session and we say so
// calmly instead of dead-ending.
//
// Failures return a calm message for the caller to render (apricot, aria-live —
// never red). Success redirects, so a returned value always means "not yet".

"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { getRepository } from "../data";
import { getViewer } from "../auth/user";
import {
  MIN_PASSWORD_LENGTH,
  PENDING_TOKEN_COOKIE,
  isAuthConfigured,
} from "../auth/config";
import { linkPurchase } from "../auth/link";
import { guardLookupAttempt } from "./lookup-guard";
import { setActiveGuaranteeCookie } from "../active-guarantee";
import { ENTRY_PATH, LOGIN_PATH, homePath, isStaff, routeAfterAuth } from "../auth/routing";

export type AuthResult = { ok: false; error: string } | { ok: true; message: string };

const UNAVAILABLE =
  "Accounts aren't switched on yet. You can still find your purchase from the welcome screen.";
const NEED_EMAIL = "Enter the email address you'd like to use.";
const NEED_PASSWORD = `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
const NEED_BOTH = "Enter your email and password to continue.";
const ALREADY_REGISTERED =
  "There's already an account with that email. Log in instead, and we'll pick up where you left off.";
const NO_MATCH =
  "That email and password don't match an account. Give them another look and try again.";
const CONFIRM_EMAIL =
  "Check your email to confirm your account, then come back and log in.";
const GENERIC =
  "That didn't go through. Give it another try in a moment.";
const RESET_SENT =
  "If that email has an account, a reset link is on its way. It's good for one hour.";
const PASSWORD_UPDATED = "Your password is set.";

/* -------------------------------------------------------------------------- */
/* Create an account                                                          */
/* -------------------------------------------------------------------------- */

export async function signUpAction(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  if (!isAuthConfigured()) return { ok: false, error: UNAVAILABLE };

  const email = (input.email ?? "").trim();
  const password = input.password ?? "";
  if (!email) return { ok: false, error: NEED_EMAIL };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: NEED_PASSWORD };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, error: calmMessage(error.message) };

  // Confirmation is off today, so a session comes straight back. If it is ever
  // turned on, there is no session yet — that's a calm message, not a failure.
  if (!data.session) return { ok: false, error: CONFIRM_EMAIL };

  redirect(await destinationAfterAuth());
}

/* -------------------------------------------------------------------------- */
/* Log in                                                                     */
/* -------------------------------------------------------------------------- */

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  if (!isAuthConfigured()) return { ok: false, error: UNAVAILABLE };

  const email = (input.email ?? "").trim();
  const password = input.password ?? "";
  if (!email || !password) return { ok: false, error: NEED_BOTH };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: calmMessage(error.message) };

  redirect(await destinationAfterAuth());
}

/* -------------------------------------------------------------------------- */
/* Log out                                                                    */
/* -------------------------------------------------------------------------- */

export async function signOutAction(): Promise<void> {
  if (isAuthConfigured()) {
    try {
      const supabase = await createClient();
      // Local scope: end THIS browser's session. The default (global) asks the
      // auth server to revoke everything and, when that call fails, returns an
      // error WITHOUT clearing cookies — leaving the person visibly stuck
      // signed in. Local always clears the cookie-stored session.
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Already gone, or the auth backend is unreachable — clearing below is
      // still the right outcome for the person in front of us.
    }
  }
  const store = await cookies();
  // Belt and braces: drop every Supabase auth cookie (sb-<ref>-auth-token and
  // its chunked variants) ourselves, so sign-out works even if the client
  // above failed before touching them.
  for (const c of store.getAll()) {
    if (c.name.startsWith("sb-")) store.delete(c.name);
  }
  // Also drop the light-verify cookie so the fallback path signs out too.
  store.delete("rap_session");
  store.delete(PENDING_TOKEN_COOKIE);
  redirect(ENTRY_PATH);
}

/* -------------------------------------------------------------------------- */
/* Password reset                                                             */
/* -------------------------------------------------------------------------- */

export async function requestPasswordResetAction(input: {
  email: string;
}): Promise<AuthResult> {
  if (!isAuthConfigured()) return { ok: false, error: UNAVAILABLE };
  const email = (input.email ?? "").trim();
  if (!email) return { ok: false, error: NEED_EMAIL };

  try {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await siteOrigin()}/auth/callback?next=/new-password`,
    });
  } catch {
    // Swallowed on purpose — see the message below.
  }
  // Always the same answer, so this can't be used to discover who has an account.
  return { ok: true, message: RESET_SENT };
}

export async function updatePasswordAction(input: {
  password: string;
}): Promise<AuthResult> {
  if (!isAuthConfigured()) return { ok: false, error: UNAVAILABLE };
  const password = input.password ?? "";
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: NEED_PASSWORD };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return { ok: false, error: "That reset link has expired. Ask for a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: calmMessage(error.message) };
  return { ok: true, message: PASSWORD_UPDATED };
}

/* -------------------------------------------------------------------------- */
/* Link a purchase to the signed-in account                                   */
/* -------------------------------------------------------------------------- */

/**
 * The self-serve link step. Runs only for an authenticated user — this is not
 * a login, so a correct sales order number on its own grants nothing.
 */
export async function linkPurchaseAction(input: {
  salesOrderNumber: string;
  lastName: string;
}): Promise<AuthResult> {
  if (!isAuthConfigured()) return { ok: false, error: UNAVAILABLE };

  const viewer = await getViewer();
  if (!viewer) redirect(LOGIN_PATH);

  // B-13: throttle order+lastname guessing before doing the match.
  const guard = await guardLookupAttempt(input.salesOrderNumber);
  if (!guard.ok) return { ok: false, error: guard.error! };

  const result = await linkPurchase(getRepository(), viewer.userId, {
    mode: "lookup",
    salesOrderNumber: input.salesOrderNumber,
    lastName: input.lastName,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // B-28: make the just-linked purchase the active one, so adding a second
  // purchase lands the app on it rather than the previous default.
  await setActiveGuaranteeCookie(result.guaranteeId);
  redirect(homePath());
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Where to send someone who has just authenticated. A parked dashboard token
 * goes through the link-token route, which is the one place allowed to spend
 * (and clear) that cookie.
 */
async function destinationAfterAuth(): Promise<string> {
  const store = await cookies();
  const pendingToken = store.get(PENDING_TOKEN_COOKIE)?.value;

  const viewer = await getViewer();
  // B-18 fix 3: staff have no linked purchase and their routing never reads
  // it (routeAfterAuth sends staff to /admin regardless), so skip the
  // guarantees round-trip for them. `linked` stays false for staff — the
  // same value the query would have produced.
  const linked =
    viewer && !isStaff(viewer.role)
      ? Boolean(await getRepository().getGuaranteeForUser(viewer.userId))
      : false;

  if (pendingToken && !linked) return "/auth/link-token";

  return routeAfterAuth({
    authConfigured: true,
    authenticated: Boolean(viewer),
    linked,
    role: viewer?.role ?? null,
    hasLightSession: false,
  });
}

/** Absolute origin for auth email links. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

/** Supabase's error strings are developer-facing. Translate to the app's voice. */
function calmMessage(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes("already registered") || message.includes("already exists")) {
    return ALREADY_REGISTERED;
  }
  if (message.includes("invalid login") || message.includes("invalid credentials")) {
    return NO_MATCH;
  }
  if (message.includes("email not confirmed")) return CONFIRM_EMAIL;
  if (message.includes("password")) return NEED_PASSWORD;
  if (message.includes("email")) return NEED_EMAIL;
  return GENERIC;
}
