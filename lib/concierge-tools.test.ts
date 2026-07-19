import { describe, it, expect, vi } from "vitest";
import { MemoryRepository } from "./data/memory-repository";
import { SEED_GUARANTEES } from "./data/seed";
import { CONCIERGE_TOOLS, createToolDispatch } from "./concierge-tools";
import { generateConciergeReply } from "./concierge";

const gid = SEED_GUARANTEES[0].id;

describe("createToolDispatch — JSON → DB, session-scoped", () => {
  it("log_nightly_check_in writes a check-in to the session's guarantee", async () => {
    const repo = new MemoryRepository();
    const dispatch = createToolDispatch(repo, gid);

    const res = await dispatch("log_nightly_check_in", { feeling: "better", note: "slept through" });
    expect(res.ok).toBe(true);

    const today = await repo.getTodayCheckIn(gid);
    expect(today?.feeling).toBe("better");
    expect(today?.note).toBe("slept through");
  });

  it("record_initial_impression writes the first impression", async () => {
    const repo = new MemoryRepository();
    const dispatch = createToolDispatch(repo, gid);

    const res = await dispatch("record_initial_impression", { impression: "softer" });
    expect(res.ok).toBe(true);

    const got = await repo.getInitialImpression(gid);
    expect(got?.impression).toBe("softer");
  });

  it("NEVER trusts an id from the model — always writes to the session's guaranteeId", async () => {
    const repo = new MemoryRepository();
    const dispatch = createToolDispatch(repo, gid);

    // Model tries to smuggle a different target id in its args.
    await dispatch("log_nightly_check_in", {
      feeling: "rougher",
      guaranteeId: "seed-guarantee-rivera",
      id: "seed-guarantee-rivera",
    });

    // The write landed on the session's guarantee, not the smuggled one.
    expect((await repo.getTodayCheckIn(gid))?.feeling).toBe("rougher");
    expect(await repo.getTodayCheckIn("seed-guarantee-rivera")).toBeNull();
  });

  it("note_concern persists without error", async () => {
    const repo = new MemoryRepository();
    const dispatch = createToolDispatch(repo, gid);
    const res = await dispatch("note_concern", { concern: "lower back ache" });
    expect(res.ok).toBe(true);
  });

  it("rejects an invalid enum value without writing", async () => {
    const repo = new MemoryRepository();
    const dispatch = createToolDispatch(repo, gid);

    const res = await dispatch("log_nightly_check_in", { feeling: "amazing" });
    expect(res.ok).toBe(false);
    expect(await repo.getTodayCheckIn(gid)).toBeNull();
  });

  it("rejects an unknown tool name", async () => {
    const repo = new MemoryRepository();
    const dispatch = createToolDispatch(repo, gid);
    const res = await dispatch("delete_everything", {});
    expect(res.ok).toBe(false);
  });
});

describe("generateConciergeReply — no key: fallback + no tool dispatch", () => {
  it("returns a scripted reply and never dispatches tools when no key is set", async () => {
    const repo = new MemoryRepository();
    const dispatch = vi.fn(createToolDispatch(repo, gid));

    const reply = await generateConciergeReply({
      apiKey: undefined,
      model: "claude-sonnet-5",
      system: "system",
      history: [{ role: "user", body: "it feels firm out of the box" }],
      fallback: {
        firstName: "Andrew",
        day: 0,
        phase: "settle_in",
        tip: null,
        userText: "it feels firm out of the box",
      },
      tools: CONCIERGE_TOOLS,
      dispatch,
    });

    // Fallback text (on-persona), no network, and the DB was never touched.
    expect(reply.length).toBeGreaterThan(0);
    expect(reply).not.toMatch(/!/);
    expect(dispatch).not.toHaveBeenCalled();
    expect(await repo.getTodayCheckIn(gid)).toBeNull();
    expect(await repo.getInitialImpression(gid)).toBeNull();
  });
});
