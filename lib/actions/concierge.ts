// lib/actions/concierge.ts
// Server action for the AI sleep concierge (PRD §2a, §3). Session-guarded and
// server-authoritative. The Anthropic key is read here, server-side only, and
// never returned to the client. With no key, generateConciergeReply degrades to
// scripted, on-persona replies — this action never crashes or leaks errors.

"use server";

import { getRepository } from "../data";
import { getAppSession } from "../auth/app-session";
import { timeOfDayFor } from "../tips";
import {
  buildSystemPrompt,
  conciergeModel,
  generateConciergeReply,
  hasAnthropicKey,
  type ConciergeContext,
} from "../concierge";
import { CONCIERGE_TOOLS, createToolDispatch } from "../concierge-tools";
import { resolveSetting } from "../app-settings";
import { RESTING_MESSAGE, capInput, decideChatQuota } from "../chat-quota";
import { isCoachEnabled } from "../shell";

export type SendResult =
  | { ok: true; reply: string }
  /** A daily limit was reached — the UI shows `message` and rests the input. */
  | { ok: true; resting: true; message: string }
  | { ok: false; error: string };

export async function sendConciergeMessage(body: string): Promise<SendResult> {
  // v3 (M-S3): the Coach is disabled in claims mode. The page redirects, but
  // the action is a door of its own, so it closes here too — calmly, never an
  // error. The code stays; only the door is closed.
  if (!isCoachEnabled()) {
    return { ok: false, error: "The guide is resting. Give us a call and we will help." };
  }

  const raw = (body ?? "").trim();
  if (!raw) return { ok: false, error: "Say a little more and I'll help." };

  const session = await getAppSession();
  if (!session) return { ok: false, error: "Your session has ended. Please sign in again." };

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) return { ok: false, error: "We couldn't find your record." };

  // B-13 Piezas 2/4: daily spend guards, all tunable via app_settings. A day is
  // the trailing 24h. Checked BEFORE persisting or calling the model, so a
  // rested coach costs nothing. Fail-open: if the counts can't be read, allow.
  const settings = await repo.getAppSettings();
  const text = capInput(raw, resolveSetting("chat_max_input_chars", settings));
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [perGuaranteeCount, globalCount] = await Promise.all([
      repo.countConciergeRepliesSince(guarantee.id, since),
      repo.countConciergeRepliesGlobalSince(since),
    ]);
    const quota = decideChatQuota({
      perGuaranteeCount,
      perGuaranteeLimit: resolveSetting("chat_messages_per_day", settings),
      globalCount,
      globalLimit: resolveSetting("chat_global_messages_per_day", settings),
    });
    if (!quota.allowed) return { ok: true, resting: true, message: RESTING_MESSAGE };
  } catch {
    // Fail-open: a counting failure must not silence the coach.
  }

  const [journey, dealerLocation] = await Promise.all([
    repo.getJourney(guarantee.id),
    repo.getDealerLocationForGuarantee(guarantee.id),
  ]);
  const day = journey?.currentDay ?? 0;
  const phase = journey?.phase ?? "settle_in";

  const thread = await repo.getOrCreateConciergeThread(guarantee.id);
  await repo.addConciergeMessage(thread.id, "user", text);
  const allMessages = await repo.listConciergeMessages(thread.id);
  // Pieza 4: only the last N turns go to the model — bounds the per-reply cost
  // on long conversations without changing what the customer sees on screen.
  const historyCap = resolveSetting("chat_history_turns", settings) * 2;
  const history = allMessages.slice(-historyCap);

  const tip = await repo.getTip({ day, phase, timeOfDay: timeOfDayFor() });

  const ctx: ConciergeContext = {
    firstName: guarantee.customerFirstName?.trim() || null,
    day,
    phase,
    product: guarantee.productDescription ?? guarantee.oemModel ?? null,
    // Dealer name resolves from the store directory (dealer_locations), the
    // same source the triage card and RA use — the per-row dealer_name is only
    // a fallback so a stale import value can't leak into the chat.
    dealer: dealerLocation?.name ?? guarantee.dealerName ?? null,
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
    // B-11: persist this reply's billed tokens (numbers + thread only, no
    // guarantee_id — privacy-adjusted design). The generator swallows sink
    // errors, so a failed insert can never break the conversation.
    onUsage: (usage) => repo.recordConciergeUsage({ threadId: thread.id, ...usage }),
  });

  await repo.addConciergeMessage(thread.id, "assistant", reply);
  return { ok: true, reply };
}
