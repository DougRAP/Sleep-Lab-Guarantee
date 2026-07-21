// app/auth/callback/route.ts
// Exchanges the one-time code from a Supabase auth email (password reset today,
// email confirmation if it's ever switched on) for a session, then continues to
// `next`. Any failure lands calmly on the login screen.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { isAuthConfigured } from "../../../lib/auth/config";
import { LOGIN_PATH, homePath } from "../../../lib/auth/routing";

/** Only ever continue to an in-app path — never an attacker-supplied origin. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return homePath();
  return value;
}

export async function GET(req: NextRequest) {
  const to = (path: string) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    return NextResponse.redirect(url);
  };

  if (!isAuthConfigured()) return to("/");

  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!code) return to(LOGIN_PATH);

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return to(LOGIN_PATH);
  } catch {
    return to(LOGIN_PATH);
  }

  return to(next);
}
