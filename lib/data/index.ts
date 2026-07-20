// lib/data/index.ts
// Repository selector. Supabase when configured; in-memory seed otherwise so the
// app runs with no keys. To go live, set NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY (see .env.example),
// then run supabase/schema.sql + supabase/seed.sql.
//
// Server-only (pulls next/headers via the Supabase server client). UI/data code
// must call this through server actions or server components, never a client one.

import type { GuaranteeRepository } from "./repository";
import { MemoryRepository } from "./memory-repository";
import { SupabaseRepository } from "./supabase-repository";

let cached: GuaranteeRepository | null = null;

/**
 * True when Supabase keys are present; false → local in-memory fallback.
 *
 * This is the DATA switch. The AUTH switch is `isAuthConfigured()` in
 * lib/auth/config.ts, which checks the two public vars (it also has to run in
 * edge middleware). Set all three env vars together and both flip at once.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getRepository(): GuaranteeRepository {
  if (cached) return cached;
  // SupabaseRepository is only constructed (and its client created) when keys exist.
  cached = isSupabaseConfigured() ? new SupabaseRepository() : new MemoryRepository();
  return cached;
}

export type { GuaranteeRepository, VerifyInput } from "./repository";
