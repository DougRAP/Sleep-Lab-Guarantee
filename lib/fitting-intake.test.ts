// lib/fitting-intake.test.ts
// The intake branch: guided vs conversational. Both paths must land the same
// two structured fields on the draft claim.

import { describe, expect, it } from "vitest";
import {
  INTAKE_TOOLS,
  buildIntakeSystemPrompt,
  createIntakeDispatch,
  intakeFallbackReply,
  intakeGreeting,
} from "./fitting-intake";
import { MemoryRepository } from "./data/memory-repository";
import { SEED_GUARANTEES } from "./data/seed";

const GUARANTEE_ID = SEED_GUARANTEES[0].id;

async function draftRepo() {
  const repo = new MemoryRepository();
  const claim = await repo.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });
  return { repo, claimId: claim.id };
}

describe("INTAKE_TOOLS", () => {
  it("offers exactly the two fields the RA needs", () => {
    expect(INTAKE_TOOLS.map((t) => t.name)).toEqual([
      "record_exchange_reason",
      "record_preferred_replacement",
    ]);
  });

  it("marks the payload required on each tool", () => {
    expect(INTAKE_TOOLS[0].input_schema.required).toEqual(["reason"]);
    expect(INTAKE_TOOLS[1].input_schema.required).toEqual(["preference"]);
  });
});

describe("createIntakeDispatch", () => {
  it("writes the reason as structured data on the draft", async () => {
    const { repo, claimId } = await draftRepo();
    const dispatch = createIntakeDispatch(repo, claimId);

    const result = await dispatch("record_exchange_reason", {
      reason: "It's firmer than the floor model and my shoulder aches.",
    });

    expect(result.ok).toBe(true);
    const claim = await repo.getClaimById(claimId);
    expect(claim?.reasonExperience).toBe(
      "It's firmer than the floor model and my shoulder aches."
    );
  });

  it("writes the preferred replacement", async () => {
    const { repo, claimId } = await draftRepo();
    const dispatch = createIntakeDispatch(repo, claimId);

    await dispatch("record_preferred_replacement", { preference: "Something plusher." });

    expect((await repo.getClaimById(claimId))?.preferredReplacement).toBe("Something plusher.");
  });

  it("only ever writes the claim it was bound to", async () => {
    const { repo, claimId } = await draftRepo();
    const dispatch = createIntakeDispatch(repo, claimId);

    // A model argument naming another claim must be ignored entirely.
    await dispatch("record_exchange_reason", {
      reason: "Too firm.",
      claimId: "someone-elses-claim",
    });

    expect((await repo.getClaimById(claimId))?.reasonExperience).toBe("Too firm.");
  });

  it("rejects empty payloads without writing", async () => {
    const { repo, claimId } = await draftRepo();
    const dispatch = createIntakeDispatch(repo, claimId);

    expect((await dispatch("record_exchange_reason", { reason: "  " })).ok).toBe(false);
    expect((await dispatch("record_preferred_replacement", {})).ok).toBe(false);
    const claim = await repo.getClaimById(claimId);
    expect(claim?.reasonExperience).toBeNull();
    expect(claim?.preferredReplacement).toBeNull();
  });

  it("reports an unknown tool rather than throwing", async () => {
    const { repo, claimId } = await draftRepo();
    const dispatch = createIntakeDispatch(repo, claimId);
    const result = await dispatch("delete_everything", {});
    expect(result.ok).toBe(false);
  });
});

describe("the guide's voice in the intake", () => {
  const ctx = {
    firstName: "Andrew",
    day: 42,
    product: "Sealy Pillow Top — Queen",
    haveReason: false,
    havePreference: false,
  };

  it("never uses claims-desk language", () => {
    const prompt = buildIntakeSystemPrompt(ctx);
    expect(prompt).toContain("never a form");
    expect(prompt.toLowerCase()).toContain("no emoji");
    for (const line of [intakeGreeting(ctx), intakeFallbackReply(ctx)]) {
      expect(line).not.toMatch(/submit|ticket|case number|claim/i);
      expect(line).not.toMatch(/!/);
    }
  });

  it("asks only for what's still missing", () => {
    expect(buildIntakeSystemPrompt({ ...ctx, haveReason: true })).toContain(
      "Ask only what they'd rather have"
    );
    expect(buildIntakeSystemPrompt({ ...ctx, havePreference: true })).toContain(
      "Ask only about their experience"
    );
    expect(
      buildIntakeSystemPrompt({ ...ctx, haveReason: true, havePreference: true })
    ).toContain("You already have both");
  });

  it("moves the customer on once both answers are held", () => {
    const reply = intakeFallbackReply({ ...ctx, haveReason: true, havePreference: true });
    expect(reply).toMatch(/model number/i);
  });
});
