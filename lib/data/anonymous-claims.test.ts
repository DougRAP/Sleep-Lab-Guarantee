// lib/data/anonymous-claims.test.ts
// v3 (M-S1) — the anonymous claim-first data layer, against the in-memory
// repository (the backend the app actually runs on today): anonymous drafts,
// claim-number minting at submit, the claim-number lookup and search, the
// guarantee auto-match, and the inspection_scheduled status edges.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { DEFAULT_DEALER_LOCATION_ID, SEED_GUARANTEES } from "./seed";
import {
  assertClaimStatusTransition,
  claimSearchMatches,
  matchGuarantee,
  permittedClaimStatusTransitions,
} from "./repository";
import { isClaimNumber } from "../ra";
import type { Guarantee } from "../types";

/** Pinned AHEAD of the seed's relative timestamps, like the staff tests. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-01T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

/** An anonymous draft with enough detail to exercise submit. */
async function anonymousDraft(
  r: MemoryRepository,
  overrides: { lastName?: string; deliveryZip?: string } = {}
) {
  const claim = await r.createAnonymousClaim({
    firstName: "Terri",
    lastName: overrides.lastName ?? "Osborne",
    deliveryZip: overrides.deliveryZip ?? "28105",
  });
  return claim;
}

describe("createAnonymousClaim", () => {
  it("opens a draft with no guarantee link", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);

    expect(claim.status).toBe("draft");
    expect(claim.step).toBe("intake");
    expect(claim.guaranteeId).toBeNull();
    expect(claim.claimNumber).toBeNull();
    expect(claim.raNumber).toBeNull();
    expect(claim.firstName).toBe("Terri");
    expect(claim.lastName).toBe("Osborne");
    expect(claim.deliveryZip).toBe("28105");
  });

  it("scopes the claim to the default dealer location (spec v3 §4)", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);
    expect(claim.dealerLocationId).toBe(DEFAULT_DEALER_LOCATION_ID);
  });

  it("accepts the purchase details + protector checkbox via updateClaim", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);
    await r.updateClaim(claim.id, {
      salesOrderNumber: "1011099600S",
      modelNumber: "PL-2290",
      purchaseDate: "2026-11-20",
      deliveryDate: "2026-11-22",
      protectorUsed: false,
      contactEmail: "terri.osborne@rapqa.com",
    });

    const saved = (await r.getClaimById(claim.id))!;
    expect(saved.salesOrderNumber).toBe("1011099600S");
    expect(saved.modelNumber).toBe("PL-2290");
    expect(saved.purchaseDate).toBe("2026-11-20");
    expect(saved.deliveryDate).toBe("2026-11-22");
    expect(saved.protectorUsed).toBe(false);
    expect(saved.contactEmail).toBe("terri.osborne@rapqa.com");
  });
});

describe("submitClaim (v3)", () => {
  it("mints a CG claim number and no RA or tracking number", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);
    const result = await r.submitClaim(claim.id);

    expect(isClaimNumber(result.claimNumber)).toBe(true);
    expect(result.claim.claimNumber).toBe(result.claimNumber);
    expect(result.raNumber).toBeNull();
    expect(result.trackingNumber).toBeNull();
    expect(result.claim.status).toBe("submitted");
    expect(result.claim.submittedAt).toBeTruthy();
  });

  it("is idempotent — a second submit keeps the same claim number", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);
    const first = await r.submitClaim(claim.id);
    const second = await r.submitClaim(claim.id);
    expect(second.claimNumber).toBe(first.claimNumber);
  });

  it("snapshots days in service from the self-reported delivery date", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);
    // 2026-11-22 → 2027-01-01 is 40 whole days (delivery = day 0).
    await r.updateClaim(claim.id, { deliveryDate: "2026-11-22" });

    const { claim: submitted } = await r.submitClaim(claim.id);
    expect(submitted.daysInServiceAtSubmit).toBe(40);
  });

  it("leaves the snapshot null when no delivery date was given", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);
    const { claim: submitted } = await r.submitClaim(claim.id);
    expect(submitted.daysInServiceAtSubmit).toBeNull();
  });

  it("stores the early-window preference when one was made", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);
    const { claim: submitted } = await r.submitClaim(claim.id, {
      earlyPreference: "auto_submit_day_31",
    });
    expect(submitted.earlyPreference).toBe("auto_submit_day_31");
  });

  it("leaves the preference null on an in-window submit", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);
    const { claim: submitted } = await r.submitClaim(claim.id);
    expect(submitted.earlyPreference).toBeNull();
  });
});

describe("getClaimByNumber", () => {
  it("round-trips a freshly submitted claim", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);
    const { claimNumber } = await r.submitClaim(claim.id);

    const found = await r.getClaimByNumber(claimNumber);
    expect(found?.id).toBe(claim.id);
  });

  it("is forgiving: case-insensitive, CG prefix optional", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r);
    const { claimNumber } = await r.submitClaim(claim.id);

    expect((await r.getClaimByNumber(claimNumber.toLowerCase()))?.id).toBe(claim.id);
    expect((await r.getClaimByNumber(claimNumber.slice(2)))?.id).toBe(claim.id);
    expect((await r.getClaimByNumber(` ${claimNumber} `))?.id).toBe(claim.id);
  });

  it("returns null for junk or an unknown number", async () => {
    const r = new MemoryRepository();
    expect(await r.getClaimByNumber("not a number")).toBeNull();
    expect(await r.getClaimByNumber("CG999999")).toBeNull(); // 9s are valid glyphs, just unknown
  });

  it("finds the seeded anonymous claim, still unlinked", async () => {
    const r = new MemoryRepository();
    const seeded = await r.getClaimByNumber("CG7MKQ42");
    expect(seeded?.lastName).toBe("Osborne");
    expect(seeded?.guaranteeId).toBeNull();
    expect(seeded?.raNumber).toBeNull();
  });
});

describe("search by claim number", () => {
  it("claimSearchMatches accepts the number with or without the CG prefix", () => {
    const guarantee = SEED_GUARANTEES[0];
    const claim = { claimNumber: "CG7MKQ42" };
    expect(claimSearchMatches("CG7MKQ42", guarantee, claim)).toBe(true);
    expect(claimSearchMatches("cg7mkq42", guarantee, claim)).toBe(true);
    expect(claimSearchMatches("7MKQ42", guarantee, claim)).toBe(true);
    expect(claimSearchMatches("7mkq42", guarantee, claim)).toBe(true);
    expect(claimSearchMatches("CG222222", guarantee, claim)).toBe(false);
    expect(claimSearchMatches("CG7MKQ42", guarantee)).toBe(false);
  });

  it("the staff list finds a linked claim by its number", async () => {
    const r = new MemoryRepository();
    const draft = await r.createDraftClaim({
      guaranteeId: "seed-guarantee-demo",
      preVerified: false,
    });
    const { claimNumber } = await r.submitClaim(draft.id);

    const hits = await r.listClaimRecords({ kind: "all" }, claimNumber);
    expect(hits.map((x) => x.claimId)).toEqual([draft.id]);
    // Prefix-free and case-blind, same as the pure rule.
    const casual = await r.listClaimRecords(
      { kind: "all" },
      claimNumber.slice(2).toLowerCase()
    );
    expect(casual.map((x) => x.claimId)).toEqual([draft.id]);
  });
});

describe("guarantee auto-match", () => {
  const CALLOWAY = SEED_GUARANTEES.find((g) => g.id === "seed-guarantee-calloway")!;

  it("matchGuarantee: exact last name + ZIP, case-insensitive", () => {
    expect(
      matchGuarantee(SEED_GUARANTEES, {
        lastName: "calloway",
        deliveryZip: "28150",
      })?.id
    ).toBe(CALLOWAY.id);
  });

  it("matchGuarantee: no match on a wrong ZIP or unknown name", () => {
    expect(
      matchGuarantee(SEED_GUARANTEES, { lastName: "Calloway", deliveryZip: "99999" })
    ).toBeNull();
    expect(
      matchGuarantee(SEED_GUARANTEES, { lastName: "Nobody", deliveryZip: "28150" })
    ).toBeNull();
  });

  // Spec §3 (2026-08-18): two alternative keys — (sales order + last name) or
  // (ZIP + last name). Either unique key links.
  it("matchGuarantee: sales order + last name is a key on its own (no ZIP)", () => {
    expect(
      matchGuarantee(SEED_GUARANTEES, {
        lastName: "Calloway",
        salesOrderNumber: "1011099412a",
      })?.id
    ).toBe(CALLOWAY.id);
    expect(
      matchGuarantee(SEED_GUARANTEES, {
        lastName: "Boyd",
        salesOrderNumber: "1011099412A", // Calloway's order, Boyd's name
      })
    ).toBeNull();
  });

  it("matchGuarantee: a wrong sales order falls back to the ZIP key", () => {
    expect(
      matchGuarantee(SEED_GUARANTEES, {
        lastName: "Calloway",
        deliveryZip: "28150",
        salesOrderNumber: "1011099412A",
      })?.id
    ).toBe(CALLOWAY.id);
    // The order key misses, but ZIP + last name still lands uniquely.
    expect(
      matchGuarantee(SEED_GUARANTEES, {
        lastName: "Calloway",
        deliveryZip: "28150",
        salesOrderNumber: "1011099999Z",
      })?.id
    ).toBe(CALLOWAY.id);
    // Both keys miss — no match.
    expect(
      matchGuarantee(SEED_GUARANTEES, {
        lastName: "Calloway",
        deliveryZip: "99999",
        salesOrderNumber: "1011099999Z",
      })
    ).toBeNull();
  });

  it("matchGuarantee: an ambiguous match is not a confident match", () => {
    const twin: Guarantee = {
      ...CALLOWAY,
      id: "test-guarantee-calloway-2",
      salesOrderNumber: "2022000009C",
    };
    expect(
      matchGuarantee([...SEED_GUARANTEES, twin], {
        lastName: "Calloway",
        deliveryZip: "28150",
      })
    ).toBeNull();
  });

  it("submit links an anonymous claim to its guarantee when confident", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r, { lastName: "Calloway", deliveryZip: "28150" });
    const { claim: submitted } = await r.submitClaim(claim.id);

    expect(submitted.guaranteeId).toBe(CALLOWAY.id);
    expect((await r.getClaimById(claim.id))?.guaranteeId).toBe(CALLOWAY.id);
  });

  it("submit never blocks on no-match — the claim goes through unlinked", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r, { lastName: "Osborne", deliveryZip: "28105" });
    const { claim: submitted, claimNumber } = await r.submitClaim(claim.id);

    expect(submitted.guaranteeId).toBeNull();
    expect(submitted.status).toBe("submitted");
    expect(isClaimNumber(claimNumber)).toBe(true);
  });

  // Spec §3 (2026-08-18): the ZIP key stands on its own — a wrong order number
  // no longer vetoes it; only both keys missing leaves the claim unlinked.
  it("a wrong sales order still links when ZIP + last name land uniquely", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r, { lastName: "Calloway", deliveryZip: "28150" });
    await r.updateClaim(claim.id, { salesOrderNumber: "1011099999Z" });

    const { claim: submitted } = await r.submitClaim(claim.id);
    expect(submitted.guaranteeId).toBe(CALLOWAY.id);
  });

  it("stays unlinked when both keys miss", async () => {
    const r = new MemoryRepository();
    const claim = await anonymousDraft(r, { lastName: "Calloway", deliveryZip: "99999" });
    await r.updateClaim(claim.id, { salesOrderNumber: "1011099999Z" });

    const { claim: submitted } = await r.submitClaim(claim.id);
    expect(submitted.guaranteeId).toBeNull();
  });

  it("links a ZIP-less claim by sales order + last name at submit", async () => {
    const r = new MemoryRepository();
    const claim = await r.createAnonymousClaim({
      firstName: "Denise",
      lastName: "Calloway",
    });
    await r.updateClaim(claim.id, { salesOrderNumber: "1011099412a" });

    const { claim: submitted } = await r.submitClaim(claim.id);
    expect(submitted.guaranteeId).toBe(CALLOWAY.id);
    expect(submitted.deliveryZip).toBeNull();
  });
});

describe("claim links", () => {
  it("attaches and lists links on a claim, oldest first", async () => {
    const r = new MemoryRepository();
    await r.addClaimLink("seed-claim-osborne", {
      kind: "tech_report",
      url: "https://example.com/tech-report.pdf",
      label: "Tech report",
    });
    vi.setSystemTime(new Date("2027-01-02T12:00:00.000Z"));
    const ea = await r.addClaimLink("seed-claim-osborne", {
      kind: "exchange_authorization",
      url: "https://example.com/ea.pdf",
      label: "Exchange authorization",
      createdBy: "auth-user-1",
    });
    expect(ea.createdBy).toBe("auth-user-1");

    const links = await r.listClaimLinks("seed-claim-osborne");
    expect(links.map((l) => l.kind)).toEqual(["tech_report", "exchange_authorization"]);
    expect(links[0].createdBy).toBeNull();
  });

  it("scopes the read to the one claim", async () => {
    const r = new MemoryRepository();
    await r.addClaimLink("seed-claim-osborne", {
      kind: "other",
      url: "https://example.com/doc",
    });
    expect(await r.listClaimLinks("seed-claim-boyd")).toEqual([]);
  });

  it("throws for an unknown claim id (mirroring addClaimNote)", async () => {
    const r = new MemoryRepository();
    await expect(
      r.addClaimLink("no-such-claim", { kind: "other", url: "https://example.com" })
    ).rejects.toThrow("No claim no-such-claim");
  });
});

describe("inspection_scheduled status edges (v3)", () => {
  it("is entered only from in_review", () => {
    expect(() =>
      assertClaimStatusTransition("in_review", "inspection_scheduled")
    ).not.toThrow();
    expect(() =>
      assertClaimStatusTransition("submitted", "inspection_scheduled")
    ).toThrow();
    expect(() =>
      assertClaimStatusTransition("approved", "inspection_scheduled")
    ).toThrow();
  });

  it("exits only to approved, denied, or back to in_review", () => {
    for (const next of ["approved", "denied", "in_review"] as const) {
      expect(() =>
        assertClaimStatusTransition("inspection_scheduled", next)
      ).not.toThrow();
    }
    for (const next of ["completed", "dealer_scheduled", "withdrawn", "draft"] as const) {
      expect(() =>
        assertClaimStatusTransition("inspection_scheduled", next)
      ).toThrow();
    }
  });

  it("the desk's offered moves follow the same edges", () => {
    expect(permittedClaimStatusTransitions("in_review")).toContain(
      "inspection_scheduled"
    );
    expect(permittedClaimStatusTransitions("submitted")).not.toContain(
      "inspection_scheduled"
    );
    expect(permittedClaimStatusTransitions("inspection_scheduled")).toEqual([
      "in_review",
      "approved",
      "denied",
    ]);
  });

  it("moves a reviewed claim through an inspection to a decision", async () => {
    const r = new MemoryRepository();
    const draft = await r.createDraftClaim({
      guaranteeId: "seed-guarantee-demo",
      preVerified: false,
    });
    const { claim } = await r.submitClaim(draft.id);

    await r.updateClaimStatus(claim.id, "in_review");
    const scheduled = await r.updateClaimStatus(claim.id, "inspection_scheduled");
    expect(scheduled.status).toBe("inspection_scheduled");
    const approved = await r.updateClaimStatus(claim.id, "approved");
    expect(approved.status).toBe("approved");
  });
});
