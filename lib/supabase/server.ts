// lib/supabase/server.ts
// Server-side Supabase clients. Two flavors:
//  - createClient(): anon key + request cookies (RLS applies; per-user session).
//  - createServiceClient(): service role (bypasses RLS) for server-authoritative
//    reads such as the light-verify lookup (consumer has no auth user yet in v1).

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set({ name, value, ...options })
            );
          } catch {
            // Called from a Server Component — safe to ignore; refreshed elsewhere.
          }
        },
      },
    }
  );
}

/** Service-role client — no cookies, RLS-bypassing. Server-only. */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
