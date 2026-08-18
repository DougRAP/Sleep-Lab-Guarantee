// lib/supabase/client.ts
// Browser Supabase client (anon key, RLS applies). Used by client components in
// later milestones. Data access today goes through the repository layer.
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!
  );
}
