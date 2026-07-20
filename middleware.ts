// middleware.ts
// Three jobs, in order:
//
//  1. Park a dashboard `?token=…` in a short-lived cookie so it survives account
//     creation. The token pre-associates a purchase — it never signs anyone in.
//  2. Refresh the Supabase auth session on every request (the @supabase/ssr
//     pattern: read cookies from the request, write refreshed ones onto the
//     response) so server components see a live session.
//  3. Keep unauthenticated visitors out of the app routes.
//
// When Supabase is NOT configured, real auth cannot work, so this falls back to
// the light-verify signed cookie exactly as before and hides the account routes.
//
// Page-level guards (lib/auth/app-session.ts) still run and are authoritative;
// this is the cheap first line so an unauthenticated request never renders app
// chrome at all.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  LIGHT_SESSION_COOKIE,
  PENDING_TOKEN_COOKIE,
  PENDING_TOKEN_MAX_AGE,
} from "./lib/auth/config";

/** Consumer app surfaces — everything behind the front door. */
const APP_PREFIXES = [
  "/tonight",
  "/guarantee",
  "/requests",
  "/shop",
  "/concierge",
  "/fitting",
];

/** Account routes, meaningless without Supabase. */
const AUTH_PREFIXES = ["/login", "/signup", "/forgot-password", "/new-password"];

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * NEXT_PUBLIC_* values are inlined at build time, so this works in the edge
 * runtime. Mirrors isAuthConfigured() in lib/auth/config.ts.
 */
function authConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Redirect while keeping any cookies already written onto `carrier`. */
function redirectTo(req: NextRequest, carrier: NextResponse, path: string) {
  const url = req.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  const res = NextResponse.redirect(url);
  carrier.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next({ request: req });

  // 1. Park a dashboard token for the link step.
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    res.cookies.set(PENDING_TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PENDING_TOKEN_MAX_AGE,
    });
  }

  // 2. No Supabase: the original light-verify flow is the authentication.
  if (!authConfigured()) {
    if (startsWithAny(pathname, AUTH_PREFIXES) || startsWithAny(pathname, ["/link"])) {
      return redirectTo(req, res, "/");
    }
    if (startsWithAny(pathname, APP_PREFIXES) && !req.cookies.get(LIGHT_SESSION_COOKIE)) {
      return redirectTo(req, res, "/");
    }
    return res;
  }

  // 3. Real auth: refresh the session, then gate.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    // Auth backend unreachable — treat as signed out rather than erroring.
    userId = null;
  }

  const needsAccount =
    startsWithAny(pathname, APP_PREFIXES) ||
    startsWithAny(pathname, ["/link", "/admin"]);

  if (!userId && needsAccount) return redirectTo(req, res, "/login");

  // Already signed in? The front door and the account screens have nothing to
  // offer. /tonight re-routes to /link or /admin if that's where they belong.
  if (userId && (pathname === "/" || startsWithAny(pathname, ["/login", "/signup"]))) {
    return redirectTo(req, res, "/tonight");
  }

  return res;
}

export const config = {
  matcher: [
    // Everything except Next internals, the API, and static assets.
    "/((?!_next/static|_next/image|api/|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
