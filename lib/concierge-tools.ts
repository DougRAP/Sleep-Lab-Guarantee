// lib/concierge-tools.ts
// Claude tool-use for the concierge chat (Change 2). When a key is present the
// model is given these tools and the chat becomes the *richer* structured-capture
// path: a `tool_use` block is dispatched here to the repository — this IS the
// conversation-to-JSON-to-DB conversion — and the model continues until it
// returns final text.
//
// Server-authoritative: the dispatch is scoped to the session's verified
// guaranteeId. The model's tool arguments NEVER choose which guarantee to write;
// any id in the arguments is ignored. Pure of next/headers so it is unit-testable
// with a MemoryRepository.

import type { Feeling, InitialImpression } from "./types";
import type {
  GuaranteeRepository,
  SaveConcernInput,
} from "./data/repository";

/** The subset of the repository the tool dispatch is allowed to touch. */
export type ConciergeToolRepo = Pick<
  GuaranteeRepository,
  "saveCheckIn" | "saveInitialImpression" | "saveConcern"
>;

/** Anthropic tool definition shape (structurally matches the SDK's Tool type). */
export interface ConciergeToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

const FEELINGS: readonly Feeling[] = ["better", "same", "rougher"];
const IMPRESSIONS: readonly InitialImpression[] = ["firmer", "just_right", "softer"];

/**
 * Tools the guide may call. Descriptions are prescriptive about WHEN to call —
 * the guide records structured data quietly, mid-conversation, and never asks
 * for order numbers or other identifiers.
 */
export const CONCIERGE_TOOLS: ConciergeToolDef[] = [
  {
    name: "log_nightly_check_in",
    description:
      "Record how the customer slept last night. Call this whenever the customer tells you how the most recent night felt compared to before — better, about the same, or rougher. Do not ask for any account or order details; the customer is already verified.",
    input_schema: {
      type: "object",
      properties: {
        feeling: {
          type: "string",
          enum: [...FEELINGS],
          description: "How last night compared to before: better, same, or rougher.",
        },
        note: {
          type: "string",
          description: "Optional short note in the customer's own words.",
        },
      },
      required: ["feeling"],
      additionalProperties: false,
    },
  },
  {
    name: "record_initial_impression",
    description:
      "Record the customer's very first out-of-the-box impression of the new mattress. Call this only for a first, brand-new impression (how it feels straight out of the box) — not for a nightly check-in about sleep.",
    input_schema: {
      type: "object",
      properties: {
        impression: {
          type: "string",
          enum: [...IMPRESSIONS],
          description:
            "firmer (firmer than expected), just_right (feels right), or softer (softer than expected).",
        },
        note: {
          type: "string",
          description: "Optional short note in the customer's own words.",
        },
      },
      required: ["impression"],
      additionalProperties: false,
    },
  },
  {
    name: "note_concern",
    description:
      "Quietly record a specific concern the customer raises (a pain point, a worry about firmness, a partner disagreement) so their guide can follow up. Use sparingly, only for a concrete concern worth remembering.",
    input_schema: {
      type: "object",
      properties: {
        concern: {
          type: "string",
          description: "The concern, in a short phrase.",
        },
      },
      required: ["concern"],
      additionalProperties: false,
    },
  },
];

export interface ToolDispatchResult {
  ok: boolean;
  /** Text returned to the model as the tool_result content. */
  message: string;
}

export type ToolDispatch = (
  name: string,
  input: unknown
) => Promise<ToolDispatchResult>;

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function optionalNote(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Build the tool dispatcher for one verified session. The returned function
 * writes ONLY to `guaranteeId` — the session's verified guarantee — regardless
 * of anything in the model's arguments.
 */
export function createToolDispatch(
  repo: ConciergeToolRepo,
  guaranteeId: string
): ToolDispatch {
  return async function dispatch(name, input) {
    const args = asRecord(input);

    switch (name) {
      case "log_nightly_check_in": {
        const feeling = args.feeling;
        if (typeof feeling !== "string" || !FEELINGS.includes(feeling as Feeling)) {
          return {
            ok: false,
            message: "Invalid feeling. Use one of: better, same, rougher.",
          };
        }
        await repo.saveCheckIn({
          guaranteeId,
          feeling: feeling as Feeling,
          note: optionalNote(args.note),
        });
        return { ok: true, message: `Logged tonight's check-in as "${feeling}".` };
      }

      case "record_initial_impression": {
        const impression = args.impression;
        if (
          typeof impression !== "string" ||
          !IMPRESSIONS.includes(impression as InitialImpression)
        ) {
          return {
            ok: false,
            message: "Invalid impression. Use one of: firmer, just_right, softer.",
          };
        }
        await repo.saveInitialImpression({
          guaranteeId,
          impression: impression as InitialImpression,
          note: optionalNote(args.note),
        });
        return {
          ok: true,
          message: `Recorded the first impression as "${impression}".`,
        };
      }

      case "note_concern": {
        const concern = args.concern;
        if (typeof concern !== "string" || !concern.trim()) {
          return { ok: false, message: "A concern needs a short description." };
        }
        const payload: SaveConcernInput = { guaranteeId, body: concern.trim() };
        await repo.saveConcern(payload);
        return { ok: true, message: "Noted the concern for follow-up." };
      }

      default:
        return { ok: false, message: `Unknown tool: ${name}` };
    }
  };
}
