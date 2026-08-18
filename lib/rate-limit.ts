// lib/rate-limit.ts
// B-13 Pieza 1: fixed-window rate limiting. The window math is pure; the count
// is an atomic per-window counter in the repository (UPSERT ... += 1), which
// sidesteps the count-then-insert race across serverless instances. The policy
// is FAIL-OPEN: if the counter store is unavailable, the request proceeds. A
// down limiter must never become an outage of the thing it guards.

/** ISO boundary a timestamp falls into for a window of `windowSeconds`. */
export function windowStart(nowMs: number, windowSeconds: number): string {
  const w = windowSeconds * 1000;
  return new Date(Math.floor(nowMs / w) * w).toISOString();
}

/** Atomically bump the counter for (bucket, key, windowStart) and return it. */
export type BumpCounter = (
  bucket: string,
  key: string,
  windowStartIso: string
) => Promise<number>;

export interface RateLimitParams {
  bucket: string;
  key: string;
  windowSeconds: number;
  limit: number;
  /** Injectable clock for tests; defaults to Date.now() at call time. */
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  /** True when the counter failed and we allowed the request defensively. */
  failOpen?: boolean;
}

/**
 * Bump the window counter and decide. Allowed while count <= limit. On any
 * counter error, allow (fail-open) and flag it so the caller can log.
 */
export async function enforceRateLimit(
  bump: BumpCounter,
  params: RateLimitParams
): Promise<RateLimitResult> {
  const now = params.now ?? Date.now();
  const start = windowStart(now, params.windowSeconds);
  try {
    const count = await bump(params.bucket, params.key, start);
    return { allowed: count <= params.limit, count };
  } catch {
    return { allowed: true, count: 0, failOpen: true };
  }
}
