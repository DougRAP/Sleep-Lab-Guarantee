// lib/actions/concierge.ts
// Server action for the AI sleep concierge (PRD §2a, §3). Session-guarded and
// server-authoritative. The Anthropic key is read here, server-side only, and
// never returned to the client. With no key, generateConciergeReply degrades to
// scripted, on-persona replies — this action never crashes or leaks errors.

"use server";

import { getRepository } from "../data";
import { getSession } from "../session";
import { timeOfDayFor } from "../tips";
import {
  buildSystemPrompt,
  conciergeModel,
  generateConciergeReply,
  hasAnthropicKey,
  type ConciergeContext,
} from "../concierge";
import { CONCIERGE_TOOLS, createToolDispatch } from "../concierge-tools";

export type SendResult = { ok: true; reply: string } | { ok: false; error: string };

export async function sendConciergeMessage(body: string): Promise<SendResult> {
  const text = (body ?? "").trim();
  if (!text) return { ok: false, error: "Say a little more and I'll help." };

  const session = await getSession();
  if (!session) return { ok: false, error: "Your session has ended. Please sign in again." };

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) return { ok: false, error: "We couldn't find your record." };

  const journey = await repo.getJourney(guarantee.id);
  const day = journey?.currentDay ?? 0;
  const phase = journey?.phase ?? "settle_in";

  const thread = await repo.getOrCreateConciergeThread(guarantee.id);
  await repo.addConciergeMessage(thread.id, "user", text);
  const history = await repo.listConciergeMessages(thread.id);

  const tip = await repo.getTip({ day, phase, timeOfDay: timeOfDayFor() });

  const ctx: ConciergeContext = {
    firstName: guarantee.customerFirstName?.trim() || null,
    day,
    phase,
    product: guarantee.productDescription ?? guarantee.oemModel ?? null,
    dealer: guarantee.dealerName ?? null,
    tip: tip ? { title: tip.title, body: tip.body } : null,
  };

  // Tool-use only runs when a key is present. Structured writes are scoped to the
  // session's verified guarantee — the model's tool args never choose the target.
  const withTools = hasAnthropicKey();

  const reply = await generateConciergeReply({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: conciergeModel(),
    system: buildSystemPrompt(ctx, { withTools }),
    history: history.map((m) => ({ role: m.role, body: m.body })),
    fallback: { ...ctx, userText: text },
    tools: withTools ? CONCIERGE_TOOLS : undefined,
    dispatch: withTools ? createToolDispatch(repo, guarantee.id) : undefined,
  });

  await repo.addConciergeMessage(thread.id, "assistant", reply);
  return { ok: true, reply };
}
