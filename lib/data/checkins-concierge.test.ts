import { describe, it, expect } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { SEED_GUARANTEES } from "./seed";

const gid = SEED_GUARANTEES[0].id;

describe("MemoryRepository — check-in persistence", () => {
  it("has no check-in before one is logged", async () => {
    const repo = new MemoryRepository();
    expect(await repo.getTodayCheckIn(gid)).toBeNull();
  });

  it("saves and reflects today's check-in", async () => {
    const repo = new MemoryRepository();
    const saved = await repo.saveCheckIn({ guaranteeId: gid, feeling: "better" });
    expect(saved.feeling).toBe("better");

    const today = await repo.getTodayCheckIn(gid);
    expect(today?.id).toBe(saved.id);
    expect(today?.feeling).toBe("better");
  });

  it("updates (does not duplicate) when re-logging the same day", async () => {
    const repo = new MemoryRepository();
    const first = await repo.saveCheckIn({ guaranteeId: gid, feeling: "same" });
    const second = await repo.saveCheckIn({
      guaranteeId: gid,
      feeling: "rougher",
      note: "tossed a bit",
    });
    expect(second.id).toBe(first.id);

    const today = await repo.getTodayCheckIn(gid);
    expect(today?.feeling).toBe("rougher");
    expect(today?.note).toBe("tossed a bit");
  });

  it("scopes today by calendar date (a past-dated ref is not today)", async () => {
    const repo = new MemoryRepository();
    await repo.saveCheckIn({ guaranteeId: gid, feeling: "better" });
    const longAgo = new Date("2000-01-01T12:00:00");
    expect(await repo.getTodayCheckIn(gid, longAgo)).toBeNull();
  });
});

describe("MemoryRepository — concierge threads/messages", () => {
  it("returns one thread per guarantee and appends messages in order", async () => {
    const repo = new MemoryRepository();
    const t1 = await repo.getOrCreateConciergeThread(gid);
    const t2 = await repo.getOrCreateConciergeThread(gid);
    expect(t2.id).toBe(t1.id);

    await repo.addConciergeMessage(t1.id, "user", "hi");
    await repo.addConciergeMessage(t1.id, "assistant", "rest easy");

    const msgs = await repo.listConciergeMessages(t1.id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1].body).toBe("rest easy");
  });
});

describe("MemoryRepository — getTip", () => {
  it("selects a settling-in tip for an early night", async () => {
    const repo = new MemoryRepository();
    const tip = await repo.getTip({ day: 12, phase: "settle_in", timeOfDay: "night" });
    expect(tip?.id).toBe("seed-tip-2");
  });
});
