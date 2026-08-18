// lib/data/staff-repository.test.ts
// The staff desk's data rules, against the in-memory repository — the backend
// the app actually runs on today: the search semantics (shared with Supabase
// via claimSearchMatches), the scope-aware detail read, the claim-notes
// thread, and the status moves the desk may offer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { SEED_CLAIMS, SEED_GUARANTEES } from "./seed";
import { permittedClaimStatusTransitions } from "./repository";
import type { ClaimRecordScope, GuaranteeRepository } from "./repository";
import type { Guarantee } from "../types";

const ALL: ClaimRecordScope = { kind: "all" };
const SHELBY: ClaimRecordScope = { kind: "dealer_location", dealerLocationId: "101" };
const ELSEWHERE: ClaimRecordScope = { kind: "dealer_location", dealerLocationId: "202" };

// The seeded ANONYMOUS claim (v3) has no guarantee row, and the staff list
// renders claims via their guarantee until M-S4's unlinked-claim handling —
// so the list today shows only the linked seeds.
const LINKED_SEED_CLAIMS = SEED_CLAIMS.filter((c) => c.guaranteeId);

/** A guarantee at a DIFFERENT dealer location, for scope-exclusion tests. */
const WHITFIELD: Guarantee = {
  id: "test-guarantee-whitfield",
  salesOrderNumber: "2022000001Z",
  guaranteeNumber: "RAP-90-2022000001Z",
  customerFirstName: "Nora",
  customerLastName: "Whitfield",
  dealerLocationId: "202",
  deliveryDate: "2026-06-01",
};

/** A repository with an extra submitted claim at location 202. */
async function repoWithOtherLocation(): Promise<{
  repo: GuaranteeRepository;
  otherClaimId: string;
}> {
  const repo = new MemoryRepository([...SEED_GUARANTEES, WHITFIELD]);
  const draft = await repo.createDraftClaim({
    guaranteeId: WHITFIELD.id,
    preVerified: false,
  });
  const { claim } = await repo.submitClaim(draft.id);
  return { repo, otherClaimId: claim.id };
}

/** Pinned AHEAD of the seed's relative timestamps, so ordering is stable. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-01T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

describe("listClaimRecords — search semantics", () => {
  it("empty and blank queries are the unfiltered list", async () => {
    const r = new MemoryRepository();
    const all = await r.listClaimRecords(ALL);
    expect(all).toHaveLength(LINKED_SEED_CLAIMS.length);
    expect((await r.listClaimRecords(ALL, "")).map((x) => x.claimId)).toEqual(
      all.map((x) => x.claimId)
    );
    expect((await r.listClaimRecords(ALL, "   ")).map((x) => x.claimId)).toEqual(
      all.map((x) => x.claimId)
    );
  });

  it("matches a sales order number exactly, case-insensitively", async () => {
    const r = new MemoryRepository();
    const hits = await r.listClaimRecords(ALL, "1011099412a");
    expect(hits.map((x) => x.claimId)).toEqual(["seed-claim-calloway"]);
  });

  it("does NOT match a sales order fragment — exact-ish means exact", async () => {
    const r = new MemoryRepository();
    expect(await r.listClaimRecords(ALL, "1011099412")).toEqual([]);
  });

  it("matches a guarantee number exactly, case-insensitively", async () => {
    const r = new MemoryRepository();
    const hits = await r.listClaimRecords(ALL, "rap-90-1011099437k");
    expect(hits.map((x) => x.claimId)).toEqual(["seed-claim-boyd"]);
  });

  it("matches a last name (the lastNameMatches rule, full name tolerated)", async () => {
    const r = new MemoryRepository();
    expect((await r.listClaimRecords(ALL, "boyd")).map((x) => x.claimId)).toEqual([
      "seed-claim-boyd",
    ]);
    expect(
      (await r.listClaimRecords(ALL, "Marcus Boyd")).map((x) => x.claimId)
    ).toEqual(["seed-claim-boyd"]);
    expect(
      (await r.listClaimRecords(ALL, "SIMMONS")).map((x) => x.claimId)
    ).toEqual(["seed-claim-simmons"]);
  });

  it("matches a partial customer name, case-insensitively", async () => {
    const r = new MemoryRepository();
    expect((await r.listClaimRecords(ALL, "denise")).map((x) => x.claimId)).toEqual([
      "seed-claim-calloway",
    ]);
    expect((await r.listClaimRecords(ALL, "kowal")).map((x) => x.claimId)).toEqual([
      "seed-claim-kowalski",
    ]);
  });

  it("matches an email address exactly, case-insensitively (Emmy 2026-07-23)", async () => {
    const r = new MemoryRepository();
    expect(
      (await r.listClaimRecords(ALL, "D.Calloway@Example.com")).map((x) => x.claimId)
    ).toEqual(["seed-claim-calloway"]);
    // A fragment never surfaces someone else's record.
    expect(await r.listClaimRecords(ALL, "calloway@")).toEqual([]);
  });

  it("matches a phone number by its digits, tolerant of formatting (Emmy 2026-07-23)", async () => {
    const r = new MemoryRepository();
    expect(
      (await r.listClaimRecords(ALL, "7045550214")).map((x) => x.claimId)
    ).toEqual(["seed-claim-calloway"]);
    expect(
      (await r.listClaimRecords(ALL, "(704) 555-0214")).map((x) => x.claimId)
    ).toEqual(["seed-claim-calloway"]);
    // A short digit fragment is not a phone — it must not match one.
    expect(await r.listClaimRecords(ALL, "0214")).toEqual([]);
  });

  it("matches a 5-digit ZIP against the customer zip (Doug 2026-07-23)", async () => {
    const zipped: Guarantee = {
      ...WHITFIELD,
      id: "test-guarantee-zip",
      salesOrderNumber: "2022000002Q",
      guaranteeNumber: "RAP-90-2022000002Q",
      customerLastName: "Quintero",
      dealerLocationId: "101",
      customerZip: "28150",
    };
    const repo = new MemoryRepository([...SEED_GUARANTEES, zipped]);
    const draft = await repo.createDraftClaim({ guaranteeId: zipped.id, preVerified: false });
    await repo.submitClaim(draft.id);

    const hits = await repo.listClaimRecords(ALL, "28150");
    expect(hits.some((x) => x.customerName.includes("Quintero"))).toBe(true);
    // The seeds carry no zip yet — a zip that matches nobody finds nothing.
    expect(await repo.listClaimRecords(ALL, "99999")).toEqual([]);
  });

  it("returns a calm empty list when nothing matches", async () => {
    const r = new MemoryRepository();
    expect(await r.listClaimRecords(ALL, "zzz-no-such-customer")).toEqual([]);
  });

  it("applies the dealer scope INSIDE the search — another location's rows never surface", async () => {
    const { repo } = await repoWithOtherLocation();

    // RAP finds the 202 request; the 101 dealer's same search finds nothing.
    expect((await repo.listClaimRecords(ALL, "whitfield")).length).toBe(1);
    expect(await repo.listClaimRecords(SHELBY, "whitfield")).toEqual([]);
    // And the 202 dealer's own search does find it.
    expect((await repo.listClaimRecords(ELSEWHERE, "whitfield")).length).toBe(1);
  });

  it("never leaks other locations into an unfiltered dealer list either", async () => {
    const { repo, otherClaimId } = await repoWithOtherLocation();
    const shelby = await repo.listClaimRecords(SHELBY);
    expect(shelby.map((x) => x.claimId)).not.toContain(otherClaimId);
    expect(shelby).toHaveLength(LINKED_SEED_CLAIMS.length);
  });
});

/* -------------------------------------------------------------------------- */
/* getClaimRecord — the staff detail's scope rule                             */
/* -------------------------------------------------------------------------- */

describe("getClaimRecord — scope enforcement", () => {
  it("resolves a claim for RAP (all) and for the owning dealer", async () => {
    const r = new MemoryRepository();
    const asRap = await r.getClaimRecord(ALL, "seed-claim-boyd");
    expect(asRap?.salesOrderNumber).toBe("1011099437K");
    const asDealer = await r.getClaimRecord(SHELBY, "seed-claim-boyd");
    expect(asDealer?.claimId).toBe("seed-claim-boyd");
  });

  it("makes another location's claim indistinguishable from one that doesn't exist", async () => {
    const { repo, otherClaimId } = await repoWithOtherLocation();

    const someoneElses = await repo.getClaimRecord(SHELBY, otherClaimId);
    const imaginary = await repo.getClaimRecord(SHELBY, "claim-does-not-exist");
    expect(someoneElses).toEqual(imaginary);
    expect(someoneElses).toBeNull();

    // The owning location still sees it.
    expect((await repo.getClaimRecord(ELSEWHERE, otherClaimId))?.claimId).toBe(
      otherClaimId
    );
  });

  it("never opens a draft — an in-progress fitting is not a request", async () => {
    const r = new MemoryRepository();
    const draft = await r.createDraftClaim({
      guaranteeId: "seed-guarantee-demo",
      preVerified: false,
    });
    expect(await r.getClaimRecord(ALL, draft.id)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Claim notes — the dealer <-> RAP thread                                    */
/* -------------------------------------------------------------------------- */

describe("claim notes", () => {
  it("seeds the thread: a dealer note on the scheduled claim, RAP notes on review/approval", async () => {
    const r = new MemoryRepository();
    const kowalski = await r.listClaimNotes("seed-claim-kowalski");
    expect(kowalski).toHaveLength(1);
    expect(kowalski[0].author).toBe("dealer");
    expect(kowalski[0].body).toMatch(/called to schedule/i);

    const natarajan = await r.listClaimNotes("seed-claim-natarajan");
    expect(natarajan).toHaveLength(1);
    expect(natarajan[0].author).toBe("rap_admin");
    expect(natarajan[0].body).toMatch(/approved/i);

    expect((await r.listClaimNotes("seed-claim-boyd"))[0]?.author).toBe("rap_admin");
  });

  it("adds a note stamped with the resolved author role, oldest first", async () => {
    const r = new MemoryRepository();
    await r.addClaimNote("seed-claim-kowalski", {
      author: "rap_admin",
      body: "  Confirmed with the store.  ",
    });

    const notes = await r.listClaimNotes("seed-claim-kowalski");
    expect(notes).toHaveLength(2);
    // Chronological: the seeded dealer note first, the new RAP note after.
    expect(notes.map((n) => n.author)).toEqual(["dealer", "rap_admin"]);
    expect(notes[1].body).toBe("Confirmed with the store.");
    expect(notes[1].isInternal).toBe(false);
    expect(notes[1].authorId).toBeNull();
  });

  it("keeps the thread in timestamp order as it grows", async () => {
    const r = new MemoryRepository();
    await r.addClaimNote("seed-claim-calloway", { author: "dealer", body: "First." });
    vi.setSystemTime(new Date("2027-01-02T12:00:00.000Z"));
    await r.addClaimNote("seed-claim-calloway", { author: "rap_admin", body: "Second." });

    const notes = await r.listClaimNotes("seed-claim-calloway");
    expect(notes.map((n) => n.body)).toEqual(["First.", "Second."]);
  });

  it("carries the real author id through when one exists", async () => {
    const r = new MemoryRepository();
    const note = await r.addClaimNote("seed-claim-boyd", {
      author: "rap_admin",
      body: "On it.",
      authorId: "auth-user-1",
    });
    expect(note.authorId).toBe("auth-user-1");
    expect(note.author).toBe("rap_admin");
  });

  it("scopes the read to the one claim", async () => {
    const r = new MemoryRepository();
    const notes = await r.listClaimNotes("seed-claim-simmons");
    expect(notes).toEqual([]);
  });

  it("throws for an unknown claim id", async () => {
    const r = new MemoryRepository();
    await expect(
      r.addClaimNote("no-such-claim", { author: "dealer", body: "Hello?" })
    ).rejects.toThrow("No claim no-such-claim");
  });

  it("does not hand out the stored row (no mutation leak)", async () => {
    const r = new MemoryRepository();
    const [note] = await r.listClaimNotes("seed-claim-kowalski");
    note.body = "tampered";
    expect((await r.listClaimNotes("seed-claim-kowalski"))[0].body).not.toBe(
      "tampered"
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Status moves the desk may offer                                            */
/* -------------------------------------------------------------------------- */

describe("permittedClaimStatusTransitions", () => {
  it("offers every non-draft move except standing still", async () => {
    const moves = permittedClaimStatusTransitions("submitted");
    expect(moves).toContain("in_review");
    expect(moves).toContain("approved");
    expect(moves).toContain("denied");
    expect(moves).not.toContain("submitted");
    expect(moves).not.toContain("draft");
  });

  it.each(["completed", "denied", "expired", "withdrawn"] as const)(
    "offers moves out of a %s claim — admin can always accommodate (review 2026-07-22)",
    (terminal) => {
      const moves = permittedClaimStatusTransitions(terminal);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves).toContain("in_review");
      expect(moves).not.toContain("draft");
      expect(moves).not.toContain(terminal);
    }
  );

  it("never offers draft, from anywhere", () => {
    for (const status of [
      "submitted",
      "in_review",
      "approved",
      "dealer_scheduled",
      "completed",
      "denied",
    ] as const) {
      expect(permittedClaimStatusTransitions(status)).not.toContain("draft");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Standard filters — status + submitted date range (review 2026-07-22)       */
/* -------------------------------------------------------------------------- */

describe("listClaimRecords — filters", () => {
  it("filters by status", async () => {
    const r = new MemoryRepository();
    const hits = await r.listClaimRecords(ALL, undefined, { status: "approved" });
    expect(hits.map((x) => x.claimId)).toEqual(["seed-claim-natarajan"]);
  });

  it("filters by submitted date range (inclusive, plain dates)", async () => {
    const r = new MemoryRepository();
    const all = await r.listClaimRecords(ALL);
    const target = all.find((x) => x.claimId === "seed-claim-boyd")!;
    const day = (target.submittedAt as string).slice(0, 10);
    const hits = await r.listClaimRecords(ALL, undefined, {
      submittedFrom: day,
      submittedTo: day,
    });
    expect(hits.map((x) => x.claimId)).toContain("seed-claim-boyd");
    for (const hit of hits) {
      expect((hit.submittedAt ?? "").slice(0, 10)).toBe(day);
    }
  });

  it("combines search, scope and filters", async () => {
    const r = new MemoryRepository();
    expect(
      await r.listClaimRecords(SHELBY, "kowal", { status: "denied" })
    ).toEqual([]);
    expect(
      (
        await r.listClaimRecords(SHELBY, "kowal", { status: "dealer_scheduled" })
      ).map((x) => x.claimId)
    ).toEqual(["seed-claim-kowalski"]);
  });
});

/* -------------------------------------------------------------------------- */
/* The exchange sales order — the dealer's one write (review 2026-07-22)      */
/* -------------------------------------------------------------------------- */

describe("recordExchangeSalesOrder", () => {
  it("records the number on an approved claim and completes it", async () => {
    const r = new MemoryRepository();
    const updated = await r.recordExchangeSalesOrder(
      "seed-claim-natarajan",
      "1011099999X"
    );
    expect(updated.exchangeSalesOrderNumber).toBe("1011099999X");
    expect(updated.status).toBe("completed");
    expect((await r.getClaimById("seed-claim-natarajan"))?.status).toBe("completed");
  });

  it("records on a scheduled claim too", async () => {
    const r = new MemoryRepository();
    const updated = await r.recordExchangeSalesOrder(
      "seed-claim-kowalski",
      "1011099998Y"
    );
    expect(updated.status).toBe("completed");
  });

  it("lets a completed claim's number be corrected without changing status", async () => {
    const r = new MemoryRepository();
    await r.recordExchangeSalesOrder("seed-claim-natarajan", "1011099999X");
    const fixed = await r.recordExchangeSalesOrder("seed-claim-natarajan", "1011099997Z");
    expect(fixed.exchangeSalesOrderNumber).toBe("1011099997Z");
    expect(fixed.status).toBe("completed");
  });

  it("refuses before RAP has approved — no exchange without authorization", async () => {
    const r = new MemoryRepository();
    await expect(
      r.recordExchangeSalesOrder("seed-claim-calloway", "1011099996W")
    ).rejects.toThrow();
    expect((await r.getClaimById("seed-claim-calloway"))?.status).toBe("submitted");
  });

  it("refuses a blank number", async () => {
    const r = new MemoryRepository();
    await expect(
      r.recordExchangeSalesOrder("seed-claim-natarajan", "   ")
    ).rejects.toThrow();
  });
});
