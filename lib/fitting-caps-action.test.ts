// lib/fitting-caps-action.test.ts
// P1 #8 (audit 2026-07-28) — the C/D checks from the test guide, run as
// automated tests against the REAL server actions (not just the pure helper):
//   C · capturePhoto rejects oversized / non-image files BEFORE storing, and
//       accepts a normal photo.
//   D · the free-text actions truncate long input to their ceilings.
// No Supabase env, so uploads degrade to metadata-only (production-safe path).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRepository } from "./data/memory-repository";
import { MAX_PHOTO_BYTES } from "./storage";

const repo = new MemoryRepository();
vi.mock("./data", () => ({ getRepository: () => repo }));
vi.mock("./auth/app-session", () => ({
  getAppSession: async () => ({
    guaranteeId: "seed-guarantee-demo",
    via: "lookup",
    userId: null,
    role: null,
    email: null,
  }),
  isPreVerifiedSession: () => false,
}));
vi.mock("./demo-server", () => ({
  effectiveReferenceDate: async () => new Date("2026-07-10T12:00:00.000Z"),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { capturePhoto, saveIntake, saveItems, saveVerify } = await import(
  "./actions/fitting"
);

/** A fresh open draft for the seeded demo guarantee, before each action. */
async function seedDraft(): Promise<string> {
  const claim = await repo.createDraftClaim({
    guaranteeId: "seed-guarantee-demo",
    preVerified: false,
  });
  return claim.id;
}

function photoForm(file: File): FormData {
  const form = new FormData();
  form.set("angle", "law_tag");
  form.set("file", file);
  return form;
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("C · capturePhoto upload guard (#8)", () => {
  it("rejects a file over the size ceiling and stores nothing", async () => {
    const claimId = await seedDraft();
    const huge = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "big.jpg", {
      type: "image/jpeg",
    });
    const res = await capturePhoto(photoForm(huge));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/too large/i);
    // Nothing was recorded — the guard returned before touching storage.
    expect(await repo.listClaimPhotos(claimId)).toHaveLength(0);
  });

  it("rejects a non-image file", async () => {
    await seedDraft();
    const pdf = new File([new Uint8Array(1000)], "receipt.pdf", {
      type: "application/pdf",
    });
    const res = await capturePhoto(photoForm(pdf));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/supported/i);
  });

  it("accepts a normal photo (recorded as metadata with no storage backend)", async () => {
    const claimId = await seedDraft();
    const jpg = new File([new Uint8Array([1, 2, 3])], "photo.jpg", {
      type: "image/jpeg",
    });
    const res = await capturePhoto(photoForm(jpg));
    expect(res.ok).toBe(true);
    const photos = await repo.listClaimPhotos(claimId);
    expect(photos).toHaveLength(1);
    expect(photos[0].captured).toBe(true);
  });
});

describe("D · free-text fields are truncated (#8)", () => {
  it("caps the intake reason and preference at 2000 chars", async () => {
    const claimId = await seedDraft();
    await saveIntake({
      reasonExperience: "x".repeat(3000),
      preferredReplacement: "y".repeat(2500),
    });
    const claim = (await repo.getClaimById(claimId))!;
    expect(claim.reasonExperience).toHaveLength(2000);
    expect(claim.preferredReplacement).toHaveLength(2000);
  });

  it("caps the model number at 200 and a new address at 300 chars", async () => {
    const claimId = await seedDraft();
    await saveItems([
      { modelNumber: "m".repeat(500), notSoiled: true, noOdors: true, notDamaged: true },
    ]);
    await saveVerify({
      contactPhone: "1".repeat(500),
      contactPhoneKind: null,
      contactEmail: "",
      atDeliveryAddress: false,
      newAddress: "a".repeat(500),
      stillOwns: true,
    });
    const items = await repo.listClaimItems(claimId);
    expect(items[0].modelNumber).toHaveLength(200);
    const claim = (await repo.getClaimById(claimId))!;
    expect(claim.contactPhone).toHaveLength(200);
    expect(claim.newAddress).toHaveLength(300);
  });
});
