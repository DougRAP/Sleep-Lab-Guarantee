// lib/actions/fitting.ts
// Server actions for the fitting. Every action is session-guarded and scoped to
// the session's verified guarantee and its open draft — the client never names
// a claim id, so a client cannot reach anyone else's request.
//
// Progress is persisted after each step, so a customer can leave the flow (the
// bottom nav is hidden inside it, but they can navigate away) and resume exactly
// where they were.

"use server";

import { revalidatePath } from "next/cache";
import { getRepository } from "../data";
import { getAppSession } from "../auth/app-session";
import { effectiveReferenceDate } from "../demo-server";
import {
  MAX_ITEMS,
  canSubmit,
  normalizeConfirmations,
  photoTargetsFor,
} from "../fitting";
import { uploadClaimPhoto } from "../storage";
import {
  buildIntakeSystemPrompt,
  createIntakeDispatch,
  INTAKE_TOOLS,
  intakeFallbackReply,
  type IntakeContext,
} from "../fitting-intake";
import {
  conciergeModel,
  generateConciergeReply,
  hasAnthropicKey,
} from "../concierge";
import type {
  Claim,
  ConfirmationKey,
  FittingStep,
  PhoneKind,
  PhotoAngle,
} from "../types";
import type { ClaimItemInput } from "../data/repository";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

const NO_SESSION = "Your session has ended. Please sign in again.";
const NO_RECORD = "We couldn't find your record.";
const NO_DRAFT = "We couldn't find your request. Start again and we'll pick it back up.";

type DraftContext =
  | { ok: false; error: string }
  | {
      ok: true;
      repo: ReturnType<typeof getRepository>;
      guarantee: NonNullable<Awaited<ReturnType<GuaranteeRepositoryLike["getGuaranteeById"]>>>;
      claim: Claim;
    };

type GuaranteeRepositoryLike = ReturnType<typeof getRepository>;

/** Resolve session → guarantee → open draft. The one gate every action shares. */
async function currentDraft(): Promise<DraftContext> {
  const session = await getAppSession();
  if (!session) return { ok: false, error: NO_SESSION };

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) return { ok: false, error: NO_RECORD };

  const claim = await repo.getDraftClaim(guarantee.id);
  if (!claim) return { ok: false, error: NO_DRAFT };

  return { ok: true, repo, guarantee, claim };
}

/** Persist the current step so a return lands on the same screen. */
export async function saveStep(step: FittingStep): Promise<ActionResult> {
  const ctx = await currentDraft();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  await ctx.repo.updateClaim(ctx.claim.id, { step });
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Step 1 — intake                                                            */
/* -------------------------------------------------------------------------- */

/** The guided (no-key) path: both fields written straight to the draft. */
export async function saveIntake(input: {
  reasonExperience: string;
  preferredReplacement: string;
}): Promise<ActionResult> {
  const ctx = await currentDraft();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  await ctx.repo.updateClaim(ctx.claim.id, {
    reasonExperience: input.reasonExperience.trim() || null,
    preferredReplacement: input.preferredReplacement.trim() || null,
    step: "items",
  });
  revalidatePath("/fitting");
  return { ok: true };
}

export interface IntakeTurn {
  reply: string;
  /** What has landed in the DB so far — drives the "still needed" note. */
  haveReason: boolean;
  havePreference: boolean;
}

/**
 * The conversational (key present) path. Reuses the concierge tool-use loop:
 * the model calls record_exchange_reason / record_preferred_replacement, each
 * dispatch writes structured JSON onto this draft, and we report back what has
 * landed so the UI can move on once both are held.
 */
export async function sendIntakeMessage(
  body: string,
  history: { role: "user" | "assistant"; body: string }[] = []
): Promise<ActionResult<IntakeTurn>> {
  const text = (body ?? "").trim();
  if (!text) return { ok: false, error: "Say a little more and I'll help." };

  const ctx = await currentDraft();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const journey = await ctx.repo.getJourney(
    ctx.guarantee.id,
    await effectiveReferenceDate(ctx.guarantee.deliveryDate)
  );

  const intakeCtx: IntakeContext = {
    firstName: ctx.guarantee.customerFirstName?.trim() || null,
    day: journey?.currentDay ?? 0,
    product: ctx.guarantee.productDescription ?? ctx.guarantee.oemModel ?? null,
    haveReason: Boolean(ctx.claim.reasonExperience?.trim()),
    havePreference: Boolean(ctx.claim.preferredReplacement?.trim()),
  };

  const withTools = hasAnthropicKey();

  const reply = await generateConciergeReply({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: conciergeModel(),
    system: buildIntakeSystemPrompt(intakeCtx),
    history: [...history, { role: "user", body: text }],
    // The concierge fallback shape is reused; the intake script is what matters.
    fallback: {
      firstName: intakeCtx.firstName,
      day: intakeCtx.day,
      phase: journey?.phase ?? "safety_net",
      userText: text,
      tip: null,
    },
    tools: withTools ? INTAKE_TOOLS : undefined,
    dispatch: withTools ? createIntakeDispatch(ctx.repo, ctx.claim.id) : undefined,
  });

  // Re-read: the tool dispatch may have written during the loop above.
  const after = await ctx.repo.getClaimById(ctx.claim.id);
  const haveReason = Boolean(after?.reasonExperience?.trim());
  const havePreference = Boolean(after?.preferredReplacement?.trim());

  return {
    ok: true,
    data: {
      reply:
        reply ||
        intakeFallbackReply({ ...intakeCtx, haveReason, havePreference }),
      haveReason,
      havePreference,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Step 2 — items                                                             */
/* -------------------------------------------------------------------------- */

export async function saveItems(items: ClaimItemInput[]): Promise<ActionResult> {
  const ctx = await currentDraft();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const cleaned = (items ?? [])
    .slice(0, MAX_ITEMS)
    .filter((i) => i && typeof i.modelNumber === "string" && i.modelNumber.trim())
    .map((i) => ({
      modelNumber: i.modelNumber.trim(),
      notSoiled: Boolean(i.notSoiled),
      noOdors: Boolean(i.noOdors),
      notDamaged: Boolean(i.notDamaged),
    }));

  await ctx.repo.saveClaimItems(ctx.claim.id, cleaned);
  await ctx.repo.updateClaim(ctx.claim.id, { step: "confirmations" });
  revalidatePath("/fitting");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Step 3 — confirmations                                                     */
/* -------------------------------------------------------------------------- */

export async function saveConfirmations(
  confirmations: ConfirmationKey[]
): Promise<ActionResult> {
  const ctx = await currentDraft();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  await ctx.repo.updateClaim(ctx.claim.id, {
    confirmations: normalizeConfirmations(confirmations),
    step: "photos",
  });
  revalidatePath("/fitting");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Step 4 — photos                                                            */
/* -------------------------------------------------------------------------- */

export interface CapturedPhoto {
  angle: PhotoAngle;
  label: string;
  fileName: string | null;
  storagePath: string | null;
  /** False when Supabase Storage isn't configured — metadata was still kept. */
  stored: boolean;
}

/**
 * Record one capture. Bytes are uploaded to Supabase Storage when configured;
 * with no Supabase env the capture is recorded as metadata only and the thumbnail
 * lives in the browser for the session. Either way the angle counts as captured,
 * so a missing storage backend never blocks the request.
 */
export async function capturePhoto(
  form: FormData
): Promise<ActionResult<CapturedPhoto>> {
  const ctx = await currentDraft();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const angle = String(form.get("angle") ?? "") as PhotoAngle;
  const target = photoTargetsFor(ctx.claim.preVerified).find((t) => t.angle === angle);
  if (!target) return { ok: false, error: "That photo isn't part of this request." };

  const file = form.get("file");
  const hasBytes = typeof File !== "undefined" && file instanceof File && file.size > 0;

  let storagePath: string | null = null;
  let stored = false;
  if (hasBytes) {
    const uploaded = await uploadClaimPhoto({
      claimId: ctx.claim.id,
      angle,
      bytes: await (file as File).arrayBuffer(),
      contentType: (file as File).type,
      fileName: (file as File).name,
    });
    storagePath = uploaded.storagePath;
    stored = uploaded.stored;
  }

  const fileName = hasBytes ? (file as File).name : String(form.get("fileName") ?? "") || null;

  await ctx.repo.recordClaimPhoto({
    claimId: ctx.claim.id,
    angle,
    label: target.label,
    storagePath,
    fileName,
  });

  return {
    ok: true,
    data: { angle, label: target.label, fileName, storagePath, stored },
  };
}

export async function finishPhotos(): Promise<ActionResult> {
  const ctx = await currentDraft();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  await ctx.repo.updateClaim(ctx.claim.id, { step: "verify" });
  revalidatePath("/fitting");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Step 5 — verify                                                            */
/* -------------------------------------------------------------------------- */

export async function saveVerify(input: {
  contactPhone: string;
  contactPhoneKind: PhoneKind | null;
  contactEmail: string;
  atDeliveryAddress: boolean | null;
  newAddress: string;
  stillOwns: boolean;
}): Promise<ActionResult> {
  const ctx = await currentDraft();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  await ctx.repo.updateClaim(ctx.claim.id, {
    contactPhone: input.contactPhone.trim() || null,
    contactPhoneKind: input.contactPhoneKind,
    contactEmail: input.contactEmail.trim() || null,
    atDeliveryAddress: input.atDeliveryAddress,
    newAddress: input.atDeliveryAddress === false ? input.newAddress.trim() || null : null,
    stillOwns: input.stillOwns,
  });
  revalidatePath("/fitting");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Step 6 — submit                                                            */
/* -------------------------------------------------------------------------- */

export interface SubmittedRequest {
  raNumber: string;
  trackingNumber: string;
  dealerName: string | null;
}

/** Finalize: generate the RA + tracking number and hand the request to the dealer. */
export async function submitFitting(): Promise<ActionResult<SubmittedRequest>> {
  const ctx = await currentDraft();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const [items, photos] = await Promise.all([
    ctx.repo.listClaimItems(ctx.claim.id),
    ctx.repo.listClaimPhotos(ctx.claim.id),
  ]);

  const snapshot = { claim: ctx.claim, items, photos };
  if (!canSubmit(snapshot)) {
    return { ok: false, error: "There's still a little left to gather." };
  }

  const result = await ctx.repo.submitClaim(ctx.claim.id);
  const dealer = await ctx.repo.getDealerLocationForGuarantee(ctx.guarantee.id);

  revalidatePath("/fitting");
  revalidatePath("/requests");
  revalidatePath("/guarantee");

  return {
    ok: true,
    data: {
      raNumber: result.raNumber,
      trackingNumber: result.trackingNumber,
      dealerName: dealer?.name ?? ctx.guarantee.dealerName ?? null,
    },
  };
}
