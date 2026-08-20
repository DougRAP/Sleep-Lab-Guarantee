// lib/storage.test.ts
// The no-Supabase photo fallback. This is the live production state today, so
// the guarantee under test is: with no storage configured, a capture never
// crashes, never blocks submission, and is still recorded as metadata.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claimPhotoPath,
  isPhotoStorageConfigured,
  photoUploadIssue,
  MAX_PHOTO_BYTES,
  uploadClaimPhoto,
} from "./storage";
import { MemoryRepository } from "./data/memory-repository";
import { SEED_GUARANTEES } from "./data/seed";
import { canSubmit, photoTargetsFor } from "./fitting";
import { CONFIRMATION_KEYS } from "./fitting";

const GUARANTEE_ID = SEED_GUARANTEES[0].id;

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_KEY;
});

describe("isPhotoStorageConfigured", () => {
  it("is false with no Supabase env", () => {
    expect(isPhotoStorageConfigured()).toBe(false);
  });

  it("needs both the URL and the service key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    expect(isPhotoStorageConfigured()).toBe(false);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    expect(isPhotoStorageConfigured()).toBe(true);
  });
});

describe("uploadClaimPhoto with no storage", () => {
  it("degrades instead of throwing", async () => {
    const result = await uploadClaimPhoto({
      claimId: "claim-1",
      angle: "law_tag",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
      fileName: "tag.jpg",
    });
    expect(result).toEqual({ stored: false, storagePath: null });
  });

  it("never touches the network (returns synchronously fast, no client built)", async () => {
    // A missing key would throw inside the Supabase client constructor; the
    // guard must short-circuit before that.
    await expect(
      uploadClaimPhoto({ claimId: "c", angle: "receipt", bytes: new Uint8Array() })
    ).resolves.toEqual({ stored: false, storagePath: null });
  });
});

describe("claimPhotoPath", () => {
  it("is one folder per claim, one object per angle", () => {
    expect(claimPhotoPath("claim-1", "law_tag")).toBe("claim-1/law_tag.jpg");
    expect(claimPhotoPath("claim-1", "top_down", "png")).toBe("claim-1/top_down.png");
  });

  it("sanitizes a hostile extension", () => {
    expect(claimPhotoPath("c", "foot", "../../etc")).toBe("c/foot.etc");
    expect(claimPhotoPath("c", "foot", "")).toBe("c/foot.jpg");
  });
});

describe("photoUploadIssue — upload guard (audit 2026-07-28, #8)", () => {
  it("accepts a normal phone photo", () => {
    expect(photoUploadIssue("image/jpeg", 2_000_000)).toBeNull();
    expect(photoUploadIssue("image/heic", 5_000_000)).toBeNull();
    expect(photoUploadIssue("image/png", 1)).toBeNull();
  });

  it("rejects a file over the size ceiling before its bytes are read", () => {
    expect(photoUploadIssue("image/jpeg", MAX_PHOTO_BYTES + 1)).toMatch(/too large/i);
  });

  it("rejects a non-image content type", () => {
    expect(photoUploadIssue("application/pdf", 1000)).toMatch(/supported/i);
    expect(photoUploadIssue("text/html", 1000)).toMatch(/supported/i);
  });

  it("is lenient when the browser omits the content type (size still capped)", () => {
    expect(photoUploadIssue(undefined, 1000)).toBeNull();
    expect(photoUploadIssue("", 1000)).toBeNull();
    expect(photoUploadIssue(undefined, MAX_PHOTO_BYTES + 1)).toMatch(/too large/i);
  });
});

describe("a request completes with no storage backend", () => {
  it("records metadata-only captures and still submits", async () => {
    expect(isPhotoStorageConfigured()).toBe(false);

    const repo = new MemoryRepository();
    const claim = await repo.createDraftClaim({
      guaranteeId: GUARANTEE_ID,
      preVerified: true,
    });

    await repo.updateClaim(claim.id, {
      reasonExperience: "Too firm.",
      preferredReplacement: "Softer.",
      confirmations: [...CONFIRMATION_KEYS],
      contactEmail: "a@rapqa.com",
      atDeliveryAddress: true,
      stillOwns: true,
    });
    await repo.saveClaimItems(claim.id, [
      { modelNumber: "1234", notSoiled: true, noOdors: true, notDamaged: true },
    ]);

    for (const target of photoTargetsFor(true)) {
      const uploaded = await uploadClaimPhoto({
        claimId: claim.id,
        angle: target.angle,
        bytes: new Uint8Array([0]),
      });
      expect(uploaded.stored).toBe(false);
      await repo.recordClaimPhoto({
        claimId: claim.id,
        angle: target.angle,
        label: target.label,
        storagePath: uploaded.storagePath,
        fileName: "capture.jpg",
      });
    }

    const photos = await repo.listClaimPhotos(claim.id);
    expect(photos).toHaveLength(photoTargetsFor(true).length);
    expect(photos.every((p) => p.captured)).toBe(true);
    expect(photos.every((p) => p.storagePath === null)).toBe(true);
    expect(photos.every((p) => Boolean(p.label))).toBe(true);

    const current = (await repo.getClaimById(claim.id))!;
    const items = await repo.listClaimItems(claim.id);
    expect(canSubmit({ claim: current, items, photos })).toBe(true);

    // v3: submit mints the claim number; RA/tracking are no longer minted.
    const result = await repo.submitClaim(claim.id);
    expect(result.claimNumber).toBeTruthy();
    expect(result.raNumber).toBeNull();
    expect(result.trackingNumber).toBeNull();
  });
});
