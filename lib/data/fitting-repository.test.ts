// lib/data/fitting-repository.test.ts
// Draft save/resume, item/photo persistence, and claim-number issuance against
// the in-memory repository — the backend the app actually runs on today.
// (v3: submit mints the CG claim number; RA/tracking are no longer minted.)

import { describe, expect, it } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { SEED_GUARANTEES } from "./seed";
import { CONFIRMATION_KEYS, canSubmit, photoTargetsFor, resumeStep } from "../fitting";
import { isClaimNumber } from "../ra";

const GUARANTEE_ID = SEED_GUARANTEES[0].id;

function repo() {
  return new MemoryRepository();
}

describe("draft lifecycle", () => {
  it("has no draft until the fitting is opened", async () => {
    const r = repo();
    expect(await r.getDraftClaim(GUARANTEE_ID)).toBeNull();
  });

  it("opens a draft on the first step", async () => {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });
    expect(claim.status).toBe("draft");
    expect(claim.step).toBe("intake");
    expect(claim.confirmations).toEqual([]);
    expect(claim.raNumber).toBeNull();
  });

  it("is idempotent — reopening returns the same draft, never a second one", async () => {
    const r = repo();
    const first = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });
    const second = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });
    expect(second.id).toBe(first.id);
  });

  it("remembers whether the order was pre-verified", async () => {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: true });
    expect(claim.preVerified).toBe(true);
    expect(photoTargetsFor(claim.preVerified).some((t) => t.angle === "receipt")).toBe(false);
  });

  it("a draft does not resolve the journey (the guarantee stays live)", async () => {
    const r = repo();
    await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });
    expect(await r.hasResolvedExchange(GUARANTEE_ID)).toBe(false);
  });
});

describe("save and resume", () => {
  it("persists the intake so it survives leaving the flow", async () => {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });

    await r.updateClaim(claim.id, {
      reasonExperience: "Firmer than the floor model.",
      preferredReplacement: "Something softer through the shoulder.",
      step: "items",
    });

    const resumed = await r.getDraftClaim(GUARANTEE_ID);
    expect(resumed?.reasonExperience).toBe("Firmer than the floor model.");
    expect(resumed?.preferredReplacement).toBe("Something softer through the shoulder.");
    expect(resumed?.step).toBe("items");
  });

  it("resumes on the persisted step, not back at the beginning", async () => {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });
    await r.updateClaim(claim.id, { step: "photos" });

    const resumed = (await r.getDraftClaim(GUARANTEE_ID))!;
    const items = await r.listClaimItems(resumed.id);
    const photos = await r.listClaimPhotos(resumed.id);
    expect(resumeStep({ claim: resumed, items, photos })).toBe("photos");
  });

  it("leaves untouched fields alone when patching one step", async () => {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });
    await r.updateClaim(claim.id, { reasonExperience: "Too firm" });
    await r.updateClaim(claim.id, { step: "confirmations" });

    const resumed = await r.getDraftClaim(GUARANTEE_ID);
    expect(resumed?.reasonExperience).toBe("Too firm");
    expect(resumed?.step).toBe("confirmations");
  });

  it("normalizes confirmations on the way in", async () => {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });
    await r.updateClaim(claim.id, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      confirmations: ["like_new", "like_new", "not_a_term"] as any,
    });
    expect((await r.getDraftClaim(GUARANTEE_ID))?.confirmations).toEqual(["like_new"]);
  });
});

describe("items", () => {
  it("saves items in order and replaces the set wholesale", async () => {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });

    await r.saveClaimItems(claim.id, [
      { modelNumber: "1234", notSoiled: true, noOdors: true, notDamaged: true },
      { modelNumber: "5678", notSoiled: true, noOdors: true, notDamaged: true },
    ]);
    expect((await r.listClaimItems(claim.id)).map((i) => i.modelNumber)).toEqual(["1234", "5678"]);

    await r.saveClaimItems(claim.id, [
      { modelNumber: "9999", notSoiled: true, noOdors: true, notDamaged: true },
    ]);
    const after = await r.listClaimItems(claim.id);
    expect(after).toHaveLength(1);
    expect(after[0].modelNumber).toBe("9999");
  });

  it("keeps at most two items", async () => {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });
    await r.saveClaimItems(claim.id, [
      { modelNumber: "1", notSoiled: true, noOdors: true, notDamaged: true },
      { modelNumber: "2", notSoiled: true, noOdors: true, notDamaged: true },
      { modelNumber: "3", notSoiled: true, noOdors: true, notDamaged: true },
    ]);
    expect(await r.listClaimItems(claim.id)).toHaveLength(2);
  });
});

describe("photos", () => {
  it("records a capture with no storage path (the no-Supabase fallback)", async () => {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: true });

    const photo = await r.recordClaimPhoto({
      claimId: claim.id,
      angle: "law_tag",
      label: "Law tag",
      storagePath: null,
      fileName: "capture.jpg",
    });

    expect(photo.captured).toBe(true);
    expect(photo.storagePath).toBeNull();
    expect(photo.label).toBe("Law tag");
    expect(photo.capturedAt).toBeTruthy();
  });

  it("a retake replaces the angle rather than stacking rows", async () => {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: true });

    await r.recordClaimPhoto({ claimId: claim.id, angle: "foot", label: "Foot", fileName: "a.jpg" });
    await r.recordClaimPhoto({ claimId: claim.id, angle: "foot", label: "Foot", fileName: "b.jpg" });

    const photos = await r.listClaimPhotos(claim.id);
    expect(photos).toHaveLength(1);
    expect(photos[0].fileName).toBe("b.jpg");
  });
});

describe("submitting — the claim number", () => {
  async function completedDraft(preVerified = false) {
    const r = repo();
    const claim = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified });
    await r.updateClaim(claim.id, {
      reasonExperience: "Too firm.",
      preferredReplacement: "Softer.",
      confirmations: [...CONFIRMATION_KEYS],
      contactPhone: "3365550101",
      contactEmail: "a@rapqa.com",
      atDeliveryAddress: true,
      stillOwns: true,
    });
    await r.saveClaimItems(claim.id, [
      { modelNumber: "1234", notSoiled: true, noOdors: true, notDamaged: true },
    ]);
    for (const target of photoTargetsFor(preVerified)) {
      await r.recordClaimPhoto({
        claimId: claim.id,
        angle: target.angle,
        label: target.label,
        storagePath: null,
      });
    }
    return { r, claimId: claim.id };
  }

  it("is submittable once every step is complete", async () => {
    const { r, claimId } = await completedDraft();
    const claim = (await r.getClaimById(claimId))!;
    expect(
      canSubmit({
        claim,
        items: await r.listClaimItems(claimId),
        photos: await r.listClaimPhotos(claimId),
      })
    ).toBe(true);
  });

  // v3: submit mints the CG###### claim number ONLY. RA issuance is a manual
  // admin action (M-S4) and the tracking number is retired.
  it("mints a claim number — and no RA or tracking number (v3)", async () => {
    const { r, claimId } = await completedDraft();
    const result = await r.submitClaim(claimId);

    expect(isClaimNumber(result.claimNumber)).toBe(true);
    expect(result.raNumber).toBeNull();
    expect(result.trackingNumber).toBeNull();
    expect(result.claim.claimNumber).toBe(result.claimNumber);
    expect(result.claim.raNumber).toBeNull();
    expect(result.claim.trackingNumber).toBeNull();
    expect(result.claim.status).toBe("submitted");
    expect(result.claim.step).toBe("submitted");
    expect(result.claim.submittedAt).toBeTruthy();
  });

  it("carries the intake, items and photos onto the submitted claim", async () => {
    const { r, claimId } = await completedDraft();
    await r.submitClaim(claimId);

    const claim = (await r.getClaimById(claimId))!;
    expect(claim.reasonExperience).toBe("Too firm.");
    expect(claim.preferredReplacement).toBe("Softer.");
    expect(claim.confirmations).toHaveLength(CONFIRMATION_KEYS.length);
    expect(await r.listClaimItems(claimId)).toHaveLength(1);
    expect(await r.listClaimPhotos(claimId)).toHaveLength(photoTargetsFor(false).length);
  });

  it("is idempotent — a second submit reuses the same claim number", async () => {
    const { r, claimId } = await completedDraft();
    const first = await r.submitClaim(claimId);
    const second = await r.submitClaim(claimId);
    expect(second.claimNumber).toBe(first.claimNumber);
  });

  it("closes the draft — a new fitting starts fresh", async () => {
    const { r, claimId } = await completedDraft();
    await r.submitClaim(claimId);

    expect(await r.getDraftClaim(GUARANTEE_ID)).toBeNull();
    const next = await r.createDraftClaim({ guaranteeId: GUARANTEE_ID, preVerified: false });
    expect(next.id).not.toBe(claimId);
  });

  it("a submitted request still does not resolve the journey (RAP adjudicates)", async () => {
    const { r, claimId } = await completedDraft();
    await r.submitClaim(claimId);
    expect(await r.hasResolvedExchange(GUARANTEE_ID)).toBe(false);
  });
});
