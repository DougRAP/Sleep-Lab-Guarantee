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

/**
 * The cache lives on globalThis, NOT in a module variable: Next.js compiles
 * separate module instances per server layer (RSC pages vs server actions
 * invoked from client components), so a module-level singleton would give the
 * in-memory backend TWO stores — actions writing to one copy while pages read
 * the other (found via the ghost-draft e2e, 2026-07-23). One process, one
 * repository, whichever layer asks. Supabase is stateless so it never cared,
 * but it shares the single instance too.
 */
const globalCache = globalThis as typeof globalThis & {
  __rapSleepLabRepository?: GuaranteeRepository;
};

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
  if (globalCache.__rapSleepLabRepository) return globalCache.__rapSleepLabRepository;
  // SupabaseRepository is only constructed (and its client created) when keys exist.
  globalCache.__rapSleepLabRepository = isSupabaseConfigured()
    ? new SupabaseRepository()
    : new MemoryRepository();
  return globalCache.__rapSleepLabRepository;
}

export type { GuaranteeRepository, VerifyInput } from "./repository";
