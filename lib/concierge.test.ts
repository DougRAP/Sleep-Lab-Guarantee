import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_MODEL,
  buildSystemPrompt,
  conciergeGreeting,
  conciergeModel,
  fallbackReply,
  generateConciergeReply,
  hasAnthropicKey,
} from "./concierge";

const prevKey = process.env.ANTHROPIC_API_KEY;
const prevModel = process.env.ANTHROPIC_MODEL;

afterEach(() => {
  if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = prevKey;
  if (prevModel === undefined) delete process.env.ANTHROPIC_MODEL;
  else process.env.ANTHROPIC_MODEL = prevModel;
});

describe("concierge config", () => {
  it("hasAnthropicKey is false when the key is unset", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(hasAnthropicKey()).toBe(false);
  });

  it("conciergeModel defaults to sonnet-5 and honors ANTHROPIC_MODEL", () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(conciergeModel()).toBe(DEFAULT_MODEL);
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5";
    expect(conciergeModel()).toBe("claude-haiku-4-5");
  });
});

describe("generateConciergeReply — fallback path (no key)", () => {
  it("returns a scripted reply and never touches the network when no key is set", async () => {
    const reply = await generateConciergeReply({
      apiKey: undefined,
      model: DEFAULT_MODEL,
      system: "system",
      history: [{ role: "user", body: "I want to return it" }],
      fallback: {
        firstName: "Andrew",
        day: 12,
        phase: "settle_in",
        tip: { title: "t", body: "Keep it cool and dark." },
        userText: "I want to return it",
      },
    });
    // settling-in exchange ask → defer to day 31, on-persona, no exclamation.
    expect(reply).toContain("day 31");
    expect(reply).not.toMatch(/!/);
    expect(reply).toContain("Andrew");
  });

  it("treats an empty key string as no key", async () => {
    const reply = await generateConciergeReply({
      apiKey: "",
      model: DEFAULT_MODEL,
      system: "system",
      history: [{ role: "user", body: "still not sleeping well" }],
      fallback: {
        firstName: null,
        day: 40,
        phase: "safety_net",
        tip: null,
        userText: "still not sleeping well",
      },
    });
    expect(reply.toLowerCase()).toContain("comfort exchange");
  });
});

describe("fallbackReply — phase awareness", () => {
  it("does not offer an exchange during settling-in", () => {
    const reply = fallbackReply({
      firstName: null,
      day: 5,
      phase: "settle_in",
      tip: null,
      userText: "how are things",
    });
    expect(reply.toLowerCase()).not.toContain("comfort exchange");
    expect(reply).toContain("still settling in");
  });

  it("offers the comfort exchange in the safety-net window on trouble", () => {
    const reply = fallbackReply({
      firstName: null,
      day: 50,
      phase: "safety_net",
      tip: null,
      userText: "it hurts my back",
    });
    expect(reply.toLowerCase()).toContain("comfort exchange");
  });
});

describe("buildSystemPrompt / conciergeGreeting", () => {
  it("embeds journey context and persona guardrails", () => {
    const sys = buildSystemPrompt({
      firstName: "Andrew",
      day: 12,
      phase: "settle_in",
      product: "Sealy Pillow Top — Queen",
      dealer: "City Mattress",
      tip: null,
    });
    expect(sys).toContain("day 12 of 90");
    expect(sys).toMatch(/No emoji/i);
    expect(sys).toContain("Sealy Pillow Top — Queen");
    // B-13 Pieza 9: the soft distress guidance is present (doctor/counselor,
    // warmth) and the crisis line is NOT scripted into the prompt.
    expect(sys).toMatch(/doctor or counselor/i);
    expect(sys).not.toContain("988");
  });

  it("greets with a phase- and day-aware opening", () => {
    expect(conciergeGreeting({ firstName: "Andrew", day: 1, phase: "settle_in" })).toContain(
      "1 night in"
    );
  });
});
