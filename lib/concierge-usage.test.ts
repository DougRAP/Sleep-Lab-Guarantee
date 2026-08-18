// lib/concierge-usage.test.ts
// B-11: the reply generator reports token usage through onUsage. Design rules
// (backlog B-11, privacy-adjusted 2026-07-24): every API round is summed —
// tool-use replies make several calls and reporting only one would under-count
// exactly the most expensive messages; the fallback path (no key) records
// nothing; a mid-flight API failure still reports what was already billed; and
// a failing onUsage sink can never break the reply itself.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateConciergeReply, type ConciergeUsageTotals } from "./concierge";
import type { FallbackContext } from "./concierge";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

const fallback: FallbackContext = {
  firstName: null,
  day: 40,
  phase: "safety_net",
  tip: null,
  userText: "hello",
};

const history = [{ role: "user" as const, body: "hello" }];

function textResponse(text: string, usage: Record<string, number>) {
  return { stop_reason: "end_turn", content: [{ type: "text", text }], usage };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("generateConciergeReply — usage capture (B-11)", () => {
  it("reports the single call's usage on the plain-text path", async () => {
    mockCreate.mockResolvedValueOnce(
      textResponse("Rest easy.", {
        input_tokens: 100,
        output_tokens: 40,
        cache_creation_input_tokens: 5,
        cache_read_input_tokens: 7,
      })
    );
    const seen: ConciergeUsageTotals[] = [];
    const reply = await generateConciergeReply({
      apiKey: "sk-test",
      model: "claude-haiku-4-5",
      system: "system",
      history,
      fallback,
      onUsage: (u) => void seen.push(u),
    });
    expect(reply).toBe("Rest easy.");
    expect(seen).toEqual([
      {
        model: "claude-haiku-4-5",
        apiCalls: 1,
        inputTokens: 100,
        outputTokens: 40,
        cacheCreationTokens: 5,
        cacheReadTokens: 7,
      },
    ]);
  });

  it("sums every round of the tool-use loop, not just the last", async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_1", name: "note_concern", input: {} }],
        usage: { input_tokens: 200, output_tokens: 30 },
      })
      .mockResolvedValueOnce(
        textResponse("Noted, gently.", { input_tokens: 260, output_tokens: 45 })
      );
    const seen: ConciergeUsageTotals[] = [];
    const reply = await generateConciergeReply({
      apiKey: "sk-test",
      model: "claude-haiku-4-5",
      system: "system",
      history,
      fallback,
      tools: [{ name: "note_concern", description: "d", input_schema: { type: "object", properties: {} } }],
      dispatch: async () => ({ ok: true, message: "saved" }),
      onUsage: (u) => void seen.push(u),
    });
    expect(reply).toBe("Noted, gently.");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      apiCalls: 2,
      inputTokens: 460,
      outputTokens: 75,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
  });

  it("never reports on the no-key fallback path", async () => {
    const onUsage = vi.fn();
    const reply = await generateConciergeReply({
      apiKey: undefined,
      model: "claude-haiku-4-5",
      system: "system",
      history,
      fallback,
      onUsage,
    });
    expect(reply.length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(onUsage).not.toHaveBeenCalled();
  });

  it("still reports billed rounds when a later API call fails", async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_1", name: "note_concern", input: {} }],
        usage: { input_tokens: 150, output_tokens: 20 },
      })
      .mockRejectedValueOnce(new Error("network down"));
    const seen: ConciergeUsageTotals[] = [];
    const reply = await generateConciergeReply({
      apiKey: "sk-test",
      model: "claude-haiku-4-5",
      system: "system",
      history,
      fallback,
      tools: [{ name: "note_concern", description: "d", input_schema: { type: "object", properties: {} } }],
      dispatch: async () => ({ ok: true, message: "saved" }),
      onUsage: (u) => void seen.push(u),
    });
    // The reply degrades to the scripted fallback…
    expect(reply.length).toBeGreaterThan(0);
    // …but the round that DID hit the API was billed, so it is reported.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ apiCalls: 1, inputTokens: 150, outputTokens: 20 });
  });

  it("a throwing onUsage sink never breaks the reply", async () => {
    mockCreate.mockResolvedValueOnce(
      textResponse("Sleep well.", { input_tokens: 10, output_tokens: 5 })
    );
    const reply = await generateConciergeReply({
      apiKey: "sk-test",
      model: "claude-haiku-4-5",
      system: "system",
      history,
      fallback,
      onUsage: () => {
        throw new Error("sink exploded");
      },
    });
    expect(reply).toBe("Sleep well.");
  });

  it("missing usage fields count as zero, never NaN", async () => {
    mockCreate.mockResolvedValueOnce(
      textResponse("Rest.", { output_tokens: 8 } as Record<string, number>)
    );
    const seen: ConciergeUsageTotals[] = [];
    await generateConciergeReply({
      apiKey: "sk-test",
      model: "claude-haiku-4-5",
      system: "system",
      history,
      fallback,
      onUsage: (u) => void seen.push(u),
    });
    expect(seen[0]).toMatchObject({
      inputTokens: 0,
      outputTokens: 8,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
  });
});
