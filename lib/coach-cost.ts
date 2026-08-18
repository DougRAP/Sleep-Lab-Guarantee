// lib/coach-cost.ts
// B-11: dollars for the coach usage report. The tokens are exact (the API
// reports them); the dollars are an ESTIMATE at list prices — the official
// spend lives in the Anthropic Console (or the Cost API with an admin key).

/**
 * Anthropic list prices for Claude Haiku 4.5, USD per million tokens, as of
 * 2026-07. The coach runs on Haiku (ANTHROPIC_MODEL); if the model ever
 * changes, update these constants alongside it.
 */
export const HAIKU_PRICES_PER_MTOK = {
  input: 1.0,
  output: 5.0,
  cacheWrite: 1.25,
  cacheRead: 0.1,
} as const;

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/** Estimated USD for a set of token totals, at Haiku list prices. */
export function estimateCostUsd(t: TokenTotals): number {
  const M = 1_000_000;
  return (
    (t.inputTokens / M) * HAIKU_PRICES_PER_MTOK.input +
    (t.outputTokens / M) * HAIKU_PRICES_PER_MTOK.output +
    (t.cacheCreationTokens / M) * HAIKU_PRICES_PER_MTOK.cacheWrite +
    (t.cacheReadTokens / M) * HAIKU_PRICES_PER_MTOK.cacheRead
  );
}

/**
 * Dollars for display. Chat replies cost fractions of a cent, so amounts under
 * a cent keep four decimals rather than collapsing to a misleading $0.00.
 */
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
