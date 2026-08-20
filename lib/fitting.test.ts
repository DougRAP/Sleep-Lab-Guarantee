// lib/fitting.test.ts
// The fitting's pure rules: the receipt-photo condition, the "still needed"
// reads (never errors), and where a returning customer resumes.

import { describe, expect, it } from "vitest";
import {
  BASE_PHOTO_TARGETS,
  CONFIRMATION_KEYS,
  CONFIRMATION_TERMS,
  MAX_ITEMS,
  canSubmit,
  confirmationsStatus,
  intakeStatus,
  itemsStatus,
  nextStep,
  normalizeConfirmations,
  photoTargetsFor,
  draftHasContent,
  photosStatus,
  previousStep,
  requiresReceiptPhoto,
  resumeStep,
  verifyStatus,
} from "./fitting";
import type { Claim, ClaimItem, ClaimPhoto, PhotoAngle } from "./types";

function item(overrides: Partial<ClaimItem> = {}): ClaimItem {
  return {
    id: "i1",
    claimId: "c1",
    modelNumber: "1234",
    notSoiled: true,
    noOdors: true,
    notDamaged: true,
    position: 0,
    ...overrides,
  };
}

function photo(angle: PhotoAngle): ClaimPhoto {
  return { id: `p-${angle}`, claimId: "c1", angle, captured: true, storagePath: null };
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "c1",
    guaranteeId: "g1",
    status: "draft",
    step: "intake",
    confirmations: [],
    preVerified: false,
    ...overrides,
  };
}

/** A claim with every field the terms require, for the happy path. */
function completeClaim(overrides: Partial<Claim> = {}): Claim {
  return claim({
    reasonExperience: "Firmer than I expected.",
    preferredReplacement: "Something softer.",
    confirmations: [...CONFIRMATION_KEYS],
    contactPhone: "3365550101",
    contactEmail: "a@rapqa.com",
    atDeliveryAddress: true,
    stillOwns: true,
    ...overrides,
  });
}

describe("requiresReceiptPhoto", () => {
  it("asks for a receipt when the order was NOT pre-verified", () => {
    expect(requiresReceiptPhoto(false)).toBe(true);
  });

  it("skips the receipt when the order arrived pre-verified from the dashboard", () => {
    expect(requiresReceiptPhoto(true)).toBe(false);
  });

  it("treats an unknown entry path as not pre-verified (asks for it)", () => {
    expect(requiresReceiptPhoto(undefined)).toBe(true);
    expect(requiresReceiptPhoto(null)).toBe(true);
  });
});

describe("photoTargetsFor", () => {
  it("is the two tags plus five uncovered mattress angles when pre-verified", () => {
    const targets = photoTargetsFor(true);
    expect(targets).toHaveLength(7);
    expect(targets.map((t) => t.angle)).toEqual([
      "law_tag",
      "model_tag",
      "foot",
      "left_side",
      "right_side",
      "head",
      "top_down",
    ]);
    expect(targets.some((t) => t.angle === "receipt")).toBe(false);
  });

  it("adds the receipt when the order was not pre-verified", () => {
    const targets = photoTargetsFor(false);
    expect(targets).toHaveLength(8);
    expect(targets.at(-1)?.angle).toBe("receipt");
  });

  it("gives every target a label and warm coaching copy", () => {
    for (const target of photoTargetsFor(false)) {
      expect(target.label.length).toBeGreaterThan(0);
      expect(target.coaching.length).toBeGreaterThan(0);
    }
  });
});

describe("draftHasContent (Emmy's ghost fix, 2026-07-23)", () => {
  const emptyDraft: Parameters<typeof draftHasContent>[0] = {
    status: "draft",
    reasonExperience: null,
    preferredReplacement: null,
    confirmations: [],
  };

  it("an untouched draft has no content — it must not clutter the list", () => {
    expect(draftHasContent(emptyDraft, [], [])).toBe(false);
  });

  it("typed intake counts as content", () => {
    expect(
      draftHasContent({ ...emptyDraft, reasonExperience: "too firm" }, [], [])
    ).toBe(true);
  });

  it("an added mattress counts as content", () => {
    expect(draftHasContent(emptyDraft, [{ modelNumber: "  " }], [])).toBe(false);
    expect(draftHasContent(emptyDraft, [{ modelNumber: "SP-1" }], [])).toBe(true);
  });

  it("a captured photo counts as content", () => {
    expect(draftHasContent(emptyDraft, [], [photo("law_tag")])).toBe(true);
  });

  it("non-draft claims always have content", () => {
    expect(draftHasContent({ ...emptyDraft, status: "submitted" }, [], [])).toBe(true);
  });
});

describe("photosStatus", () => {
  const allBase = BASE_PHOTO_TARGETS.map((t) => photo(t.angle));

  it("is complete for a pre-verified request without a receipt", () => {
    expect(photosStatus(allBase, true).complete).toBe(true);
  });

  it("is complete without the receipt — the receipt is optional (review 2026-07-22)", () => {
    const status = photosStatus(allBase, false);
    expect(status.complete).toBe(true);
    expect(status.stillNeeded).toEqual([]);
  });

  it("offers the receipt as an optional target when not pre-verified", () => {
    const receipt = photoTargetsFor(false).find((t) => t.angle === "receipt");
    expect(receipt?.optional).toBe(true);
  });

  it("counts a capture with no storage path — the fallback still counts", () => {
    const status = photosStatus([...allBase, photo("receipt")], false);
    expect(status.complete).toBe(true);
  });

  it("names missing angles by their label, not as errors", () => {
    const status = photosStatus([photo("law_tag")], true);
    expect(status.stillNeeded).toContain("Foot");
    expect(status.stillNeeded).toContain("Top-down");
  });
});

describe("intakeStatus", () => {
  it("needs both the experience and the preferred replacement", () => {
    const status = intakeStatus({ reasonExperience: null, preferredReplacement: null });
    expect(status.complete).toBe(false);
    expect(status.stillNeeded).toHaveLength(2);
  });

  it("is complete once both are held", () => {
    expect(
      intakeStatus({ reasonExperience: "Too firm", preferredReplacement: "Softer" }).complete
    ).toBe(true);
  });

  it("treats whitespace as unanswered", () => {
    expect(
      intakeStatus({ reasonExperience: "   ", preferredReplacement: "Softer" }).complete
    ).toBe(false);
  });
});

describe("itemsStatus", () => {
  it("needs at least one model number", () => {
    expect(itemsStatus([]).complete).toBe(false);
  });

  it("needs all three condition checks per item", () => {
    const status = itemsStatus([item({ noOdors: false })]);
    expect(status.complete).toBe(false);
    expect(status.stillNeeded[0]).toContain("1234");
  });

  it("is complete with one fully-checked item", () => {
    expect(itemsStatus([item()]).complete).toBe(true);
  });

  it("allows up to two items", () => {
    expect(MAX_ITEMS).toBe(2);
    expect(itemsStatus([item(), item({ id: "i2", modelNumber: "5678", position: 1 })]).complete).toBe(
      true
    );
  });
});

describe("confirmationsStatus", () => {
  it("requires all nine statements from the terms", () => {
    expect(CONFIRMATION_TERMS).toHaveLength(9);
    expect(confirmationsStatus([]).stillNeeded).toHaveLength(9);
  });

  it("is complete only with the full set", () => {
    expect(confirmationsStatus(CONFIRMATION_KEYS).complete).toBe(true);
    expect(confirmationsStatus(CONFIRMATION_KEYS.slice(1)).complete).toBe(false);
  });

  it("reports what's left as the statement itself, not a field name", () => {
    const status = confirmationsStatus(CONFIRMATION_KEYS.slice(0, 8));
    expect(status.stillNeeded[0]).toBe(CONFIRMATION_TERMS[8].statement);
  });
});

describe("normalizeConfirmations", () => {
  it("drops unknown keys and de-duplicates", () => {
    expect(normalizeConfirmations(["like_new", "like_new", "nonsense"])).toEqual(["like_new"]);
  });

  it("returns the catalog order regardless of input order", () => {
    expect(normalizeConfirmations(["us_original_dealer", "clean_sanitary"])).toEqual([
      "clean_sanitary",
      "us_original_dealer",
    ]);
  });

  it("survives junk input", () => {
    expect(normalizeConfirmations(null)).toEqual([]);
    expect(normalizeConfirmations("like_new")).toEqual([]);
  });
});

describe("verifyStatus", () => {
  it("accepts a phone OR an email", () => {
    const base = { atDeliveryAddress: true, newAddress: null, stillOwns: true };
    expect(verifyStatus({ ...base, contactPhone: "3365550101", contactEmail: null }).complete).toBe(
      true
    );
    expect(verifyStatus({ ...base, contactPhone: null, contactEmail: "a@b.co" }).complete).toBe(
      true
    );
    expect(verifyStatus({ ...base, contactPhone: null, contactEmail: null }).complete).toBe(false);
  });

  it("asks where the mattress is when it has moved", () => {
    const status = verifyStatus({
      contactPhone: "3365550101",
      contactEmail: null,
      atDeliveryAddress: false,
      newAddress: null,
      stillOwns: true,
    });
    expect(status.complete).toBe(false);
    expect(status.stillNeeded).toContain("Where the mattress is now");
  });

  it("needs the ownership confirmation", () => {
    const status = verifyStatus({
      contactPhone: "3365550101",
      contactEmail: null,
      atDeliveryAddress: true,
      newAddress: null,
      stillOwns: false,
    });
    expect(status.complete).toBe(false);
  });
});

describe("canSubmit", () => {
  const photos = photoTargetsFor(false).map((t) => photo(t.angle));

  it("is true once every step is complete", () => {
    expect(canSubmit({ claim: completeClaim(), items: [item()], photos })).toBe(true);
  });

  it("is false while any photo is outstanding", () => {
    expect(
      canSubmit({ claim: completeClaim(), items: [item()], photos: photos.slice(1) })
    ).toBe(false);
  });

  it("is false while a confirmation is outstanding", () => {
    expect(
      canSubmit({
        claim: completeClaim({ confirmations: CONFIRMATION_KEYS.slice(1) }),
        items: [item()],
        photos,
      })
    ).toBe(false);
  });

  it("a pre-verified request needs one fewer photo", () => {
    const preVerified = completeClaim({ preVerified: true });
    const withoutReceipt = photos.filter((p) => p.angle !== "receipt");
    expect(canSubmit({ claim: preVerified, items: [item()], photos: withoutReceipt })).toBe(true);
  });
});

describe("step navigation", () => {
  it("walks forward through the flow", () => {
    expect(nextStep("intake")).toBe("items");
    expect(nextStep("items")).toBe("confirmations");
    expect(nextStep("confirmations")).toBe("photos");
    expect(nextStep("photos")).toBe("verify");
    expect(nextStep("verify")).toBe("submitted");
    expect(nextStep("submitted")).toBe("submitted");
  });

  it("walks back, stopping at the first screen", () => {
    expect(previousStep("intake")).toBeNull();
    expect(previousStep("photos")).toBe("confirmations");
  });
});

describe("resumeStep", () => {
  it("honors the persisted step so a return lands where they left off", () => {
    const snapshot = { claim: claim({ step: "photos" }), items: [], photos: [] };
    expect(resumeStep(snapshot)).toBe("photos");
  });

  it("falls back to the first incomplete step when nothing is persisted", () => {
    const snapshot = {
      claim: claim({
        step: undefined,
        reasonExperience: "Too firm",
        preferredReplacement: "Softer",
      }),
      items: [],
      photos: [],
    };
    expect(resumeStep(snapshot)).toBe("items");
  });

  it("sends a submitted request to the closing screen", () => {
    const snapshot = {
      claim: claim({ status: "submitted", step: "verify" }),
      items: [],
      photos: [],
    };
    expect(resumeStep(snapshot)).toBe("submitted");
  });
});
