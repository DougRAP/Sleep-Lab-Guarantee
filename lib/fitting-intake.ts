// lib/fitting-intake.ts
// Step 1 of the fitting — capturing (a) why they want to exchange and (b) what
// they'd rather have, as structured JSON on the draft claim.
//
// Guided-first. With no ANTHROPIC_API_KEY the UI shows a warm scripted form and
// writes both fields directly. With a key, the same two fields are captured
// conversationally, reusing the concierge tool-use pattern (lib/concierge.ts) —
// a `tool_use` block is dispatched here into the repository, so either path ends
// with the same structured data in the DB.
//
// Server-authoritative: the dispatch is bound to one already-created draft claim.
// Nothing in the model's arguments chooses which claim is written.

import type { ConciergeToolDef, ToolDispatch } from "./concierge-tools";
import type { GuaranteeRepository } from "./data/repository";

/**
 * Shown when the intake's per-hour rate limit is reached (audit 2026-07-28). An
 * honest customer never sees it (the limit is generous); it rests a script
 * calmly instead of spending on the model, and keeps the guided form usable.
 */
export const INTAKE_RESTING_REPLY =
  "Let's take a short breather and pick this back up in a little while. You can also type your reason and preference straight into the form below.";

/** The repository surface the intake dispatch may touch. */
export type IntakeToolRepo = Pick<GuaranteeRepository, "updateClaim" | "getClaimById">;

export const INTAKE_TOOLS: ConciergeToolDef[] = [
  {
    name: "record_exchange_reason",
    description:
      "Record, in the customer's own words, why the mattress isn't working for them — the experience they've had. Call this as soon as they've described it, even briefly. Do not ask for order numbers or other identifiers.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Their experience and why they want to exchange, in a sentence or two, faithful to what they said.",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "record_preferred_replacement",
    description:
      "Record what the customer would rather have instead — the replacement they're picturing (firmer, softer, a different model, a different size feel). Call this once they've described a preference, even loosely.",
    input_schema: {
      type: "object",
      properties: {
        preference: {
          type: "string",
          description:
            "The replacement they'd prefer, in their own words. A rough description is fine.",
        },
      },
      required: ["preference"],
      additionalProperties: false,
    },
  },
];

export interface IntakeContext {
  firstName: string | null;
  day: number;
  product?: string | null;
  /** What we already hold, so the guide asks only for what's still needed. */
  haveReason: boolean;
  havePreference: boolean;
}

/** The guide's system prompt for the intake conversation. */
export function buildIntakeSystemPrompt(ctx: IntakeContext): string {
  const lines: string[] = [
    "You are the sleep concierge for RAP Sleep Lab, walking a customer through the start of a comfort exchange — what we call 'the fitting'. This is a conversation, never a form.",
    "Voice: warm, literary, and spare. One thought at a time. Warmth comes from restraint.",
    "Hard rules:",
    "- No emoji. No exclamation points. No chirpy support-speak. Never say 'submit a request', 'claim', 'ticket', or 'case number'.",
    "- Keep replies short: two to four sentences.",
    "- Never ask for order numbers, email, phone, address, or payment details — those come later, and the customer is already verified.",
    "- Do not mention forms, fields, or that you are recording anything.",
    "You need exactly two things from this conversation, and you record each one quietly with your tools the moment you have it:",
    "1. Why they want to exchange — their experience of the mattress (record_exchange_reason).",
    "2. What they'd rather have instead — the replacement they're picturing (record_preferred_replacement).",
    `It is day ${ctx.day} of their 90 nights, so the comfort exchange is open to them.`,
  ];

  if (ctx.firstName) {
    lines.push(`The customer's first name is ${ctx.firstName}. Use it sparingly.`);
  }
  if (ctx.product) lines.push(`Their current mattress: ${ctx.product}.`);

  if (ctx.haveReason && ctx.havePreference) {
    lines.push(
      "You already have both. Acknowledge warmly, in one or two sentences, and tell them the next step is the mattress itself — the model number and a few photos."
    );
  } else if (ctx.haveReason) {
    lines.push(
      "You already have their reason. Ask only what they'd rather have instead, and record it when they answer."
    );
  } else if (ctx.havePreference) {
    lines.push(
      "You already know what they'd prefer. Ask only about their experience with the current mattress, and record it when they answer."
    );
  } else {
    lines.push(
      "Start with their experience — how the mattress has been for them — then move to what they'd rather have. One question at a time."
    );
  }

  return lines.join("\n");
}

/** The guide's opening line on the intake screen. */
export function intakeGreeting(ctx: Pick<IntakeContext, "firstName">): string {
  const hello = ctx.firstName ? `${ctx.firstName}, ` : "";
  return `${hello}let's take this one step at a time. Start wherever you like — how has the mattress been for you?`;
}

/**
 * Scripted reply when there is no key (or a call fails). Deterministic and
 * side-effect free — the guided form is the real capture path in that case, so
 * this only has to stay on-persona.
 */
export function intakeFallbackReply(ctx: IntakeContext): string {
  if (ctx.haveReason && ctx.havePreference) {
    return "Thank you — that's what I needed. Next we'll look at the mattress itself: the model number, and a few photos together.";
  }
  if (ctx.haveReason) {
    return "That helps. And what would you rather have instead — something firmer, softer, or a different model altogether?";
  }
  if (ctx.havePreference) {
    return "Good to know. Tell me how the mattress you have now has been for you — what hasn't been right?";
  }
  return "Tell me how it's been — what doesn't feel right about the mattress you have now?";
}

/**
 * Build the intake tool dispatcher, bound to one draft claim. Writes ONLY that
 * claim regardless of anything in the model's arguments.
 */
export function createIntakeDispatch(
  repo: IntakeToolRepo,
  claimId: string
): ToolDispatch {
  return async function dispatch(name, input) {
    const args =
      input && typeof input === "object" ? (input as Record<string, unknown>) : {};

    switch (name) {
      case "record_exchange_reason": {
        const reason = args.reason;
        if (typeof reason !== "string" || !reason.trim()) {
          return { ok: false, message: "A short description of their experience is needed." };
        }
        await repo.updateClaim(claimId, { reasonExperience: reason.trim() });
        return { ok: true, message: "Recorded why they'd like to exchange." };
      }

      case "record_preferred_replacement": {
        const preference = args.preference;
        if (typeof preference !== "string" || !preference.trim()) {
          return { ok: false, message: "A short description of the preference is needed." };
        }
        await repo.updateClaim(claimId, { preferredReplacement: preference.trim() });
        return { ok: true, message: "Recorded the replacement they'd prefer." };
      }

      default:
        return { ok: false, message: `Unknown tool: ${name}` };
    }
  };
}
