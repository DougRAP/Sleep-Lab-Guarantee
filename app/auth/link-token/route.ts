// app/auth/link-token/route.ts
// Spends a parked dashboard token: links the pre-associated purchase to the
// account that just authenticated, then clears the cookie.
//
// A route handler rather than a page because this is the one place allowed to
// both write cookies and redirect. The token still doesn't authenticate anyone
// — we only get here with a live Supabase session.

import { NextResponse, type NextRequest } from "next/server";
import { getRepository } from "../../../lib/data";
import { getViewer } from "../../../lib/auth/user";
import { isAuthConfigured, PENDING_TOKEN_COOKIE } from "../../../lib/auth/config";
import { linkPurchase } from "../../../lib/auth/link";
import { HOME_PATH, LINK_PATH, LOGIN_PATH } from "../../../lib/auth/routing";

export async function GET(req: NextRequest) {
  const to = (path: string) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const res = NextResponse.redirect(url);
    // Spent either way: a token that didn't match shouldn't keep re-firing.
    res.cookies.delete(PENDING_TOKEN_COOKIE);
    return res;
  };

  if (!isAuthConfigured()) return to("/");

  const viewer = await getViewer();
  if (!viewer) return to(LOGIN_PATH);

  const repo = getRepository();
  if (await repo.getGuaranteeForUser(viewer.userId)) return to(HOME_PATH);

  const token = req.cookies.get(PENDING_TOKEN_COOKIE)?.value;
  if (!token) return to(LINK_PATH);

  const result = await linkPurchase(repo, viewer.userId, { mode: "token", token });
  // On failure fall through to the manual link step — calm, never an error page.
  return to(result.ok ? HOME_PATH : LINK_PATH);
}
