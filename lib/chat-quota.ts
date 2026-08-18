// lib/chat-quota.ts
// B-13 Piezas 2/3/4: the chat's spend guards. A human never trips these (the
// most extreme insomniac night is ~120 replies; the default is 300). When
// tripped, the coach rests honestly until tomorrow rather than faking scripted
// answers — the owner's call: it's the AI or a human, never a decoy.

/** The honest, on-brand message shown when a daily limit is reached (Pieza 3). */
export const RESTING_MESSAGE =
  "I've given you all I have for tonight — even a sleep coach needs rest. Let's pick this up again tomorrow.";

export interface ChatQuotaInput {
  perGuaranteeCount: number;
  perGuaranteeLimit: number;
  globalCount: number;
  globalLimit: number;
}

export interface ChatQuotaDecision {
  allowed: boolean;
  /** Which limit rested the coach (for logging/telemetry, not shown). */
  scope?: "guarantee" | "global";
}

/** Allowed while BOTH daily counts are under their limits. */
export function decideChatQuota(i: ChatQuotaInput): ChatQuotaDecision {
  if (i.globalCount >= i.globalLimit) return { allowed: false, scope: "global" };
  if (i.perGuaranteeCount >= i.perGuaranteeLimit) return { allowed: false, scope: "guarantee" };
  return { allowed: true };
}

/** Bound one message's length so a giant paste can't inflate the token cost. */
export function capInput(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
