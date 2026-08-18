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
import { getAppSession, isPreVerifiedSession } from "../auth/app-session";
import { effectiveReferenceDate } from "../demo-server";
import { evaluateEligibility } from "../eligibility";
import {
  MAX_ITEMS,
  canSubmit,
  normalizeConfirmations,
  photoTargetsFor,
} from "../fitting";
import { photoUploadIssue, uploadClaimPhoto } from "../storage";
import {
  buildIntakeSystemPrompt,
  createIntakeDispatch,
  INTAKE_RESTING_REPLY,
  INTAKE_TOOLS,
  intakeFallbackReply,
  type IntakeContext,
} from "../fitting-intake";
import {
  conciergeModel,
  generateConciergeReply,
  hasAnthropicKey,
} from "../concierge";
import { resolveSetting } from "../app-settings";
import { capInput } from "../chat-quota";
import { enforceRateLimit } from "../rate-limit";
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

// Audit 2026-07-28 (#8): length ceilings on free-text fields written from the
// client, so a script can't store megabytes per field. Generous for real input.
const MAX_STORY_CHARS = 2000; // reason / preferred replacement (a paragraph)
const MAX_LINE_CHARS = 200; // phone, email, model number (a single line)
const MAX_ADDRESS_CHARS = 300; // a delivery address

type DraftContext =
  | { ok: false; error: string }
  | {
      ok: true;
      repo: ReturnType<typeof getRepository>;
      guarantee: NonNullable<Awaited<ReturnType<GuaranteeRepositoryLike["getGuaranteeById"]>>>;
      claim: Claim;
    };

type GuaranteeRepositoryLike = ReturnType<typeof getRepository>;

/**
 * Resolve session → guarantee → open draft. The one gate every action shares.
 *
 * The draft is created LAZILY here, on the first real interaction — not when
 * the fitting page is merely opened (Emmy's ghost fix, 2026-07-23: an
 * untouched visit used to leave an empty "Not yet submitted" behind). Because
 * creation moved server-action-side, the page's eligibility gate is re-checked
 * here before creating: no draft is ever born outside the day 31–90 window.
 */
async function currentDraft(): Promise<DraftContext> {
  const session = await getAppSession();
  if (!session) return { ok: false, error: NO_SESSION };

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) return { ok: false, error: NO_RECORD };

  let claim = await repo.getDraftClaim(guarantee.id);
  if (!claim) {
    // B-29 (Doug 2026-07-27): the server-side gate for lazy draft creation now
    // only enforces the window + the one-time (resolved) rule; a prior
    // submitted request no longer blocks minting a fresh draft.
    const exchangeResolved = await repo.hasResolvedExchange(guarantee.id);
    const elig = evaluateEligibility({
      deliveryDate: guarantee.deliveryDate,
      referenceDate: await effectiveReferenceDate(guarantee.deliveryDate),
      exchangeResolved,
    });
    if (!elig.eligible) return { ok: false, error: NO_DRAFT };
    claim = await repo.createDraftClaim({
      guaranteeId: guarantee.id,
      preVerified: isPreVerifiedSession(session),
    });
  }

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
    reasonExperience: capInput(input.reasonExperience.trim(), MAX_STORY_CHARS) || null,
    preferredReplacement: capInput(input.preferredReplacement.trim(), MAX_STORY_CHARS) || null,
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

  // Audit 2026-07-28 (#5): this path calls the model just like the coach, but
  // shipped with no spend guard. Cap the message and enforce a per-guarantee
  // hourly limit BEFORE the model call. Generous enough that no real customer
  // trips it; a script rests calmly instead of running up Anthropic cost.
  // Fail-open, mirroring the lookup guard: a limiter outage never blocks intake.
  const settings = await ctx.repo.getAppSettings();
  const capped = capInput(text, resolveSetting("chat_max_input_chars", settings));
  const bump = ctx.repo.bumpRateCounter.bind(ctx.repo);
  // Two fuses, mirroring the coach: a per-guarantee hourly limit AND a
  // program-wide hourly fuse, so a distributed caller can't bypass the
  // per-guarantee cap by spreading requests across many guarantees.
  const [perGuarantee, global] = await Promise.all([
    enforceRateLimit(bump, {
      bucket: "intake_message",
      key: ctx.guarantee.id,
      windowSeconds: 3600,
      limit: resolveSetting("intake_messages_per_hour", settings),
    }),
    enforceRateLimit(bump, {
      bucket: "intake_message_global",
      key: "all",
      windowSeconds: 3600,
      limit: resolveSetting("intake_messages_global_per_hour", settings),
    }),
  ]);
  if (!perGuarantee.allowed || !global.allowed) {
    return {
      ok: true,
      data: {
        reply: INTAKE_RESTING_REPLY,
        haveReason: Boolean(ctx.claim.reasonExperience?.trim()),
        havePreference: Boolean(ctx.claim.preferredReplacement?.trim()),
      },
    };
  }

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
    history: [...history, { role: "user", body: capped }],
    // The concierge fallback shape is reused; the intake script is what matters.
    fallback: {
      firstName: intakeCtx.firstName,
      day: intakeCtx.day,
      phase: journey?.phase ?? "safety_net",
      userText: capped,
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
      modelNumber: capInput(i.modelNumber.trim(), MAX_LINE_CHARS),
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
    // Audit 2026-07-28 (#8): reject oversized/non-image files BEFORE reading the
    // bytes into memory, so a huge upload can't exhaust the server action.
    const issue = photoUploadIssue((file as File).type, (file as File).size);
    if (issue) return { ok: false, error: issue };
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
    contactPhone: capInput(input.contactPhone.trim(), MAX_LINE_CHARS) || null,
    contactPhoneKind: input.contactPhoneKind,
    contactEmail: capInput(input.contactEmail.trim(), MAX_LINE_CHARS) || null,
    atDeliveryAddress: input.atDeliveryAddress,
    newAddress:
      input.atDeliveryAddress === false
        ? capInput(input.newAddress.trim(), MAX_ADDRESS_CHARS) || null
        : null,
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
      // v3: submit no longer mints RA/tracking numbers, so these are empty for
      // new requests — the legacy fitting UI is replaced in M-S2/M-S3.
      raNumber: result.raNumber ?? "",
      trackingNumber: result.trackingNumber ?? "",
      dealerName: dealer?.name ?? ctx.guarantee.dealerName ?? null,
    },
  };
}
