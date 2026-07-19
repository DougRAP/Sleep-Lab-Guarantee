// lib/concierge.ts
// The AI sleep concierge (PRD §2a, §3, §6; DESIGN.md "The concierge — voice &
// persona"). Anthropic is optional: when no ANTHROPIC_API_KEY is present the
// concierge still works, returning scripted, on-persona replies derived from the
// journey day/phase + tonight's tip. The key is read server-side only.

import type { ConciergeRole, JourneyPhase } from "./types";

/** Default model; overridable via ANTHROPIC_MODEL. */
export const DEFAULT_MODEL = "claude-sonnet-5";

export function conciergeModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

/** True only when a real key is configured server-side. */
export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export interface ConciergeContext {
  firstName: string | null;
  day: number;
  phase: JourneyPhase;
  product?: string | null;
  dealer?: string | null;
  tip?: { title: string; body: string } | null;
}

export interface FallbackContext extends ConciergeContext {
  userText: string;
}

function phaseLabel(phase: JourneyPhase): string {
  switch (phase) {
    case "settle_in":
      return "settling in (days 0–30)";
    case "safety_net":
      return "comfort-exchange window (days 31–90)";
    case "expired":
      return "past the 90-night window";
    case "resolved":
      return "exchange resolved";
  }
}

/** The persona system prompt, given non-sensitive journey context. */
export function buildSystemPrompt(ctx: ConciergeContext): string {
  const lines: string[] = [
    "You are the sleep concierge for RAP Sleep Lab — a calm bedside guide for someone who recently bought a new mattress and is settling into it over a 90-night period. The 90-Night Comfort Guarantee is a safety net inside this journey, not the headline.",
    "Voice: warm, literary, and spare — a trusted presence at bedtime, one thought at a time. Warmth comes from restraint, not enthusiasm.",
    "Hard rules:",
    "- No emoji. No exclamation points. No chirpy support-speak. Never say 'submit a request', 'ticket', or 'case number'.",
    "- Keep replies short: two to four sentences, one idea at a time.",
    "- Never ask for or repeat sensitive details (order numbers, email, phone, address, or payment).",
    "- Narrate any task gently ('let's take a look together') rather than presenting a form.",
    "- Stay within sleep, mattress comfort, and the 90-night comfort guarantee. Gently redirect anything else. You do not give medical advice.",
    `Journey: it is day ${ctx.day} of 90 for this customer. Phase: ${phaseLabel(ctx.phase)}.`,
  ];

  switch (ctx.phase) {
    case "settle_in":
      lines.push(
        "Guidance: they are still in the settling-in window (days 0–30). Encourage patience and small adjustments — most bodies take four to six weeks. The comfort exchange is NOT offered yet; it opens on day 31. Do not suggest an exchange. Help them adjust."
      );
      break;
    case "safety_net":
      lines.push(
        "Guidance: they are in the comfort-exchange window (days 31–90). If sleep still isn't right, you may gently offer to walk them through a one-time comfort exchange ('the fitting') — warmly, without pressure, and never as a form."
      );
      break;
    case "expired":
      lines.push(
        "Guidance: the 90-night window has closed, so the exchange is no longer available. Stay supportive and keep offering comfort and sleep guidance."
      );
      break;
    case "resolved":
      lines.push(
        "Guidance: their comfort exchange is already resolved. Keep things simple and reassuring."
      );
      break;
  }

  if (ctx.firstName) lines.push(`The customer's first name is ${ctx.firstName}. Use it sparingly and naturally.`);
  if (ctx.product) lines.push(`Their mattress: ${ctx.product}.`);
  if (ctx.dealer) lines.push(`Purchased from: ${ctx.dealer}.`);
  if (ctx.tip?.body) lines.push(`Tonight's tip you may weave in if it helps: "${ctx.tip.body}"`);

  return lines.join("\n");
}

/** The guide's opening line on /concierge, tied to journey day + phase. */
export function conciergeGreeting(
  ctx: Pick<ConciergeContext, "firstName" | "day" | "phase">
): string {
  const hello = ctx.firstName ? `${ctx.firstName}, ` : "";
  const nights = `${ctx.day} ${ctx.day === 1 ? "night" : "nights"} in`;
  switch (ctx.phase) {
    case "safety_net":
      return `${hello}you're ${nights}. I'm here whenever you want to talk it through — how has your sleep been settling?`;
    case "expired":
      return `${hello}the 90-night window has closed, but I'm still here. What's on your mind tonight?`;
    case "resolved":
      return `${hello}your exchange is set. Rest easy — is there anything I can help you settle tonight?`;
    case "settle_in":
    default:
      return `${hello}you're ${nights}. Tell me how it's been feeling, and we'll take it one night at a time.`;
  }
}

function tail(tip?: string | null): string {
  return tip ? ` ${tip}` : " Keep your room cool and dark tonight, and rest easy.";
}

/**
 * Scripted, on-persona reply used when no API key is present (or the model call
 * fails). Derived from journey day/phase + tonight's tip + a light read of the
 * user's words. Deterministic and side-effect free.
 */
export function fallbackReply(ctx: FallbackContext): string {
  const hello = ctx.firstName ? `${ctx.firstName}, ` : "";
  const t = ctx.userText.toLowerCase();
  const tipBody = ctx.tip?.body;
  const mentionsExchange = /(exchange|return|refund|swap|money ?back|send it back|take it back)/.test(t);
  const mentionsTrouble = /(pain|sore|ache|hurt|bad|worse|rough|awful|can'?t sleep|not sleeping|uncomfortable|hate|stiff)/.test(t);

  if (mentionsExchange) {
    if (ctx.phase === "settle_in") {
      return `${hello}I hear you. Let's give it through the first few weeks first — the comfort exchange opens on day 31, and I'll walk it through with you step by step when it does.${tail(tipBody)}`;
    }
    if (ctx.phase === "safety_net") {
      return `${hello}we can look at a comfort exchange together — you're in the window now. When you're ready I'll take you through it one step at a time, no forms to wrestle with. What doesn't feel right — the firmness, or something else?`;
    }
    if (ctx.phase === "expired") {
      return `${hello}the 90-night window has closed, so an exchange isn't available now — but I can still help you sleep more comfortably on the set you have.${tail(tipBody)}`;
    }
  }

  if (mentionsTrouble) {
    if (ctx.phase === "safety_net") {
      return `${hello}I'm sorry it's been rough. You're past the settling-in stretch, so if it still isn't right we can start a comfort exchange whenever you like. Tell me what feels off, and we'll take the next small step.`;
    }
    return `${hello}thank you for telling me. A little roughness this early is common while your body learns the surface.${tail(tipBody)} Let's see how the next couple of nights feel.`;
  }

  const opener =
    ctx.phase === "safety_net"
      ? `${hello}you're ${ctx.day} nights in, past the settling-in window.`
      : ctx.phase === "expired"
      ? `${hello}you're ${ctx.day} nights in.`
      : `${hello}you're ${ctx.day} nights in — still settling in.`;
  return `${opener}${tail(tipBody)} How did last night feel?`;
}

export interface GenerateParams {
  /** Server-side key. Undefined/empty → scripted fallback, no network call. */
  apiKey?: string;
  model: string;
  system: string;
  history: { role: ConciergeRole; body: string }[];
  fallback: FallbackContext;
}

/**
 * Produce the guide's next reply. Branches on key presence:
 *  - no key → scripted fallback (never touches the network).
 *  - key    → Anthropic via @anthropic-ai/sdk, with the same fallback on any error.
 * The route/action must never crash or leak errors when the key is missing.
 */
export async function generateConciergeReply(params: GenerateParams): Promise<string> {
  const key = params.apiKey?.trim();
  if (!key) return fallbackReply(params.fallback);

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });

    const messages = params.history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.body,
      }));

    // The Messages API requires the first turn to be a user turn.
    if (messages.length === 0 || messages[0].role !== "user") {
      return fallbackReply(params.fallback);
    }

    const res = await client.messages.create({
      model: params.model,
      max_tokens: 400,
      thinking: { type: "disabled" },
      system: params.system,
      messages,
    });

    let text = "";
    for (const block of res.content) {
      if (block.type === "text") text += block.text;
    }
    text = text.trim();
    return text || fallbackReply(params.fallback);
  } catch {
    // Missing/invalid key, network error, unsupported param, etc. — degrade calmly.
    return fallbackReply(params.fallback);
  }
}
