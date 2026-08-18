// lib/fitting.ts
// The fitting — pure domain logic (no I/O, no next/headers). Owns the step
// order, the tap-to-confirm catalog drawn from the 90-Night terms, the photo
// targets, and the "still needed" reads.
//
// Voice note: nothing here produces an *error*. A step that isn't finished
// reports what is "still needed", in the guide's calm register — never a
// validation failure, never red (DESIGN.md anti-patterns).

import type {
  Claim,
  ClaimItem,
  ClaimPhoto,
  ConfirmationKey,
  FittingStep,
  PhotoAngle,
} from "./types";

/** Screen order. `submitted` is the closing confirmation, not a capture step. */
export const FITTING_STEPS: FittingStep[] = [
  "intake",
  "items",
  "confirmations",
  "photos",
  "verify",
  "submitted",
];

/** Max mattresses per request (PRD). */
export const MAX_ITEMS = 2;

export interface ConfirmationTerm {
  key: ConfirmationKey;
  /** The statement the customer taps to confirm, in plain language. */
  statement: string;
}

/**
 * The tap-to-confirm statements, worded from the 90-Night terms. All are
 * required to continue — the guide asks for them once, together.
 */
export const CONFIRMATION_TERMS: ConfirmationTerm[] = [
  {
    key: "clean_sanitary",
    statement: "The mattress is clean and sanitary.",
  },
  {
    key: "law_tag_attached",
    statement: "The law tag is still attached and legible.",
  },
  {
    key: "model_tag_attached",
    statement: "The model tag is still attached and legible.",
  },
  {
    key: "like_new",
    statement: "The mattress is in like-new condition.",
  },
  {
    key: "both_partners_present",
    statement: "Both sleep partners can be there to choose the replacement.",
  },
  {
    key: "within_window",
    statement: "We're between day 31 and day 90 of the 90 nights.",
  },
  {
    key: "original_owner",
    statement: "I'm still the original owner of this mattress.",
  },
  {
    key: "in_possession_household",
    statement: "It's still in my possession and has only had household use.",
  },
  {
    key: "us_original_dealer",
    statement: "I'm in the US and bought from my original dealer.",
  },
];

export const CONFIRMATION_KEYS: ConfirmationKey[] = CONFIRMATION_TERMS.map((t) => t.key);

export interface PhotoTarget {
  angle: PhotoAngle;
  label: string;
  /** Warm coaching copy — the guide narrating the shot, not an instruction list. */
  coaching: string;
  /** True when this target is only asked for in some cases (the receipt). */
  conditional?: boolean;
  /**
   * True when the capture is welcome but never blocks the request (review
   * 2026-07-22: "if they want to add the receipt, fine; if they don't, fine").
   */
  optional?: boolean;
}

/** The two tag shots + five uncovered mattress angles, in capture order. */
export const BASE_PHOTO_TARGETS: PhotoTarget[] = [
  {
    angle: "law_tag",
    label: "Law tag",
    coaching:
      "The law tag is the fabric tag sewn to the side or the foot of the mattress. Close enough to read it, and we're set.",
  },
  {
    angle: "model_tag",
    label: "Model tag",
    coaching:
      "The model tag usually sits near the law tag. Let's get the model name and number in frame.",
  },
  {
    angle: "foot",
    label: "Foot",
    coaching:
      "Sheets off, please — this one's the whole mattress from the foot of the bed.",
  },
  {
    angle: "left_side",
    label: "Left side",
    coaching: "Step to the left side and take in the full length of the mattress.",
  },
  {
    angle: "right_side",
    label: "Right side",
    coaching: "Now the right side, the same way.",
  },
  {
    angle: "head",
    label: "Head",
    coaching: "From the head of the bed, looking down toward the foot.",
  },
  {
    angle: "top_down",
    label: "Top-down",
    coaching:
      "Last one — as square over the middle as you can manage, so the whole surface shows.",
  },
];

export const RECEIPT_PHOTO_TARGET: PhotoTarget = {
  angle: "receipt",
  label: "Receipt",
  coaching:
    "Optional — if the receipt is handy, one photo helps confirm the purchase. Skip it if it isn't.",
  conditional: true,
  optional: true,
};

/**
 * v3 anonymous intake (spec §2.6): the trimmed, ALL-OPTIONAL set — photos are
 * welcome and speed the review, but never block a request (a technician can
 * complete them later). Separate list on purpose; the legacy fitting keeps its
 * own targets and rules untouched.
 */
export const CLAIM_PHOTO_TARGETS: PhotoTarget[] = [
  {
    angle: "law_tag",
    label: "Law tag",
    coaching:
      "Bedding, linens, and any protector off first. The law tag is the fabric tag sewn to the side or the foot — close enough to read it, and we're set.",
    optional: true,
  },
  {
    angle: "model_tag",
    label: "Model tag",
    coaching:
      "The model tag usually sits near the law tag. Let's get the model name and number in frame.",
    optional: true,
  },
  {
    angle: "top_down",
    label: "Top-down",
    coaching:
      "With the mattress uncovered, as square over the middle as you can manage, so the whole surface shows.",
    optional: true,
  },
  {
    angle: "receipt",
    label: "Receipt",
    coaching:
      "If the receipt is handy, one photo helps confirm the purchase. Skip it if it isn't.",
    optional: true,
  },
];

/**
 * The receipt photo is OFFERED only when the sales order was not pre-verified —
 * i.e. the customer looked themselves up rather than arriving on the
 * dashboard/CRM token link, where the order is already confirmed. Since the
 * 2026-07-22 review it is optional either way: offered, never required.
 */
export function requiresReceiptPhoto(preVerified: boolean | null | undefined): boolean {
  return !preVerified;
}

/** The photo targets for this request, receipt offered only when useful. */
export function photoTargetsFor(preVerified: boolean | null | undefined): PhotoTarget[] {
  return requiresReceiptPhoto(preVerified)
    ? [...BASE_PHOTO_TARGETS, RECEIPT_PHOTO_TARGET]
    : [...BASE_PHOTO_TARGETS];
}

/* -------------------------------------------------------------------------- */
/* "Still needed" reads — never errors                                        */
/* -------------------------------------------------------------------------- */

export interface StepStatus {
  complete: boolean;
  /** Calm, plain-language notes on what is still needed. Empty when complete. */
  stillNeeded: string[];
}

function nonEmpty(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

export function intakeStatus(claim: Pick<Claim, "reasonExperience" | "preferredReplacement">): StepStatus {
  const stillNeeded: string[] = [];
  if (!nonEmpty(claim.reasonExperience)) stillNeeded.push("How the mattress has been for you");
  if (!nonEmpty(claim.preferredReplacement)) stillNeeded.push("What you'd rather have");
  return { complete: stillNeeded.length === 0, stillNeeded };
}

export function itemsStatus(items: ClaimItem[]): StepStatus {
  const stillNeeded: string[] = [];
  const usable = items.filter((i) => nonEmpty(i.modelNumber));
  if (usable.length === 0) stillNeeded.push("A model number from the tag or your receipt");
  for (const item of usable) {
    if (!(item.notSoiled && item.noOdors && item.notDamaged)) {
      stillNeeded.push(`The three condition checks for ${item.modelNumber.trim()}`);
    }
  }
  return { complete: stillNeeded.length === 0 && usable.length > 0, stillNeeded };
}

export function confirmationsStatus(confirmations: ConfirmationKey[] | undefined): StepStatus {
  const have = new Set(confirmations ?? []);
  const missing = CONFIRMATION_TERMS.filter((t) => !have.has(t.key));
  return {
    complete: missing.length === 0,
    stillNeeded: missing.map((t) => t.statement),
  };
}

/**
 * True when a claim is worth showing in the consumer's Requests list. Every
 * non-draft claim is; a DRAFT only once it holds real progress (typed intake,
 * a mattress, a capture, or a tapped confirmation). Emmy's ghost fix
 * (2026-07-23): an untouched draft born from merely opening the fitting must
 * not clutter the list as "Not yet submitted".
 */
export function draftHasContent(
  claim: Pick<Claim, "status" | "reasonExperience" | "preferredReplacement" | "confirmations">,
  items: Pick<ClaimItem, "modelNumber">[],
  photos: Pick<ClaimPhoto, "captured">[]
): boolean {
  if (claim.status !== "draft") return true;
  return (
    nonEmpty(claim.reasonExperience) ||
    nonEmpty(claim.preferredReplacement) ||
    items.some((i) => nonEmpty(i.modelNumber)) ||
    photos.some((p) => p.captured) ||
    (claim.confirmations?.length ?? 0) > 0
  );
}

export function photosStatus(
  photos: ClaimPhoto[],
  preVerified: boolean | null | undefined
): StepStatus {
  const captured = new Set(photos.filter((p) => p.captured).map((p) => p.angle));
  // Optional targets (the receipt) are offered but never counted against
  // completeness — they must not block the request.
  const missing = photoTargetsFor(preVerified).filter(
    (t) => !t.optional && !captured.has(t.angle)
  );
  return {
    complete: missing.length === 0,
    stillNeeded: missing.map((t) => t.label),
  };
}

export function verifyStatus(
  claim: Pick<Claim, "contactPhone" | "contactEmail" | "atDeliveryAddress" | "newAddress" | "stillOwns">
): StepStatus {
  const stillNeeded: string[] = [];
  if (!nonEmpty(claim.contactPhone) && !nonEmpty(claim.contactEmail)) {
    stillNeeded.push("A phone number or an email address");
  }
  if (claim.atDeliveryAddress === null || claim.atDeliveryAddress === undefined) {
    stillNeeded.push("Whether the mattress is still at the delivery address");
  } else if (claim.atDeliveryAddress === false && !nonEmpty(claim.newAddress)) {
    stillNeeded.push("Where the mattress is now");
  }
  if (claim.stillOwns !== true) stillNeeded.push("That you still own the mattress");
  return { complete: stillNeeded.length === 0, stillNeeded };
}

export interface FittingSnapshot {
  claim: Claim;
  items: ClaimItem[];
  photos: ClaimPhoto[];
}

/** Per-step completeness for the whole request. */
export function fittingStatus(snapshot: FittingSnapshot): Record<
  Exclude<FittingStep, "submitted">,
  StepStatus
> {
  return {
    intake: intakeStatus(snapshot.claim),
    items: itemsStatus(snapshot.items),
    confirmations: confirmationsStatus(snapshot.claim.confirmations),
    photos: photosStatus(snapshot.photos, snapshot.claim.preVerified),
    verify: verifyStatus(snapshot.claim),
  };
}

/** True when every capture step is complete and the request can be submitted. */
export function canSubmit(snapshot: FittingSnapshot): boolean {
  return Object.values(fittingStatus(snapshot)).every((s) => s.complete);
}

/**
 * Where to resume. The persisted step wins (customers move freely and we honor
 * where they left off); otherwise the first incomplete step.
 */
export function resumeStep(snapshot: FittingSnapshot): FittingStep {
  if (snapshot.claim.status !== "draft") return "submitted";
  const saved = snapshot.claim.step;
  if (saved && FITTING_STEPS.includes(saved) && saved !== "submitted") return saved;
  const status = fittingStatus(snapshot);
  const order: Exclude<FittingStep, "submitted">[] = [
    "intake",
    "items",
    "confirmations",
    "photos",
    "verify",
  ];
  return order.find((s) => !status[s].complete) ?? "verify";
}

/** The next screen after `step`. */
export function nextStep(step: FittingStep): FittingStep {
  const i = FITTING_STEPS.indexOf(step);
  if (i < 0 || i >= FITTING_STEPS.length - 1) return "submitted";
  return FITTING_STEPS[i + 1];
}

/** The previous screen, or null on the first. */
export function previousStep(step: FittingStep): FittingStep | null {
  const i = FITTING_STEPS.indexOf(step);
  if (i <= 0) return null;
  return FITTING_STEPS[i - 1];
}

/** Keep only recognized confirmation keys, de-duplicated and in catalog order. */
export function normalizeConfirmations(raw: unknown): ConfirmationKey[] {
  if (!Array.isArray(raw)) return [];
  const have = new Set(raw.filter((v): v is string => typeof v === "string"));
  return CONFIRMATION_KEYS.filter((k) => have.has(k));
}
