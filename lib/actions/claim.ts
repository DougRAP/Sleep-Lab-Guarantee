// lib/actions/claim.ts
// Server actions for the v3 ANONYMOUS intake flow (/claim). Every action is
// scoped to the claimant cookie's draft (lib/claim-session.ts) — the client
// never names a claim id, so nobody can write into anyone else's request.
// requireGuarantee() is deliberately not involved anywhere in this flow.

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRepository } from "../data";
import {
  clearClaimSession,
  getClaimSession,
  setClaimSession,
} from "../claim-session";
import {
  claimReadyToSubmit,
  dayCountMessage,
  earlyPreferenceRequired,
  isBackwardStage,
  isEarlyPreference,
  stageForStep,
  stepForStage,
  validateClaimEntry,
} from "../claim-flow";
import { journeyDay } from "../eligibility";
import { CLAIM_PHOTO_TARGETS, CONFIRMATION_TERMS, normalizeConfirmations } from "../fitting";
import { photoUploadIssue, uploadClaimPhoto } from "../storage";
import { enforceRateLimit } from "../rate-limit";
import type { ActionResult } from "./fitting";
import type { ClaimStage } from "../claim-flow";
import type { Claim, ConfirmationKey, EarlyPreference, PhotoAngle } from "../types";

const NO_CLAIM =
  "We couldn't find your request. Start again from the beginning and we'll pick it right back up.";
const TOO_MANY =
  "Too many attempts just now. Please wait a few minutes and try again.";

// Same single-line ceiling the fitting's actions apply (audit 2026-07-28 #8).
const MAX_LINE_CHARS = 200;

/** A plain YYYY-MM-DD, or null. Garbage never throws — it just isn't a date. */
function plainDate(value: string): string | null {
  const v = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function line(value: unknown): string {
  return String(value ?? "").trim().slice(0, MAX_LINE_CHARS);
}

type ClaimContext =
  | { ok: false; error: string }
  | { ok: true; repo: ReturnType<typeof getRepository>; claim: Claim };

/**
 * Resolve cookie → claim. Writes only ever land on a DRAFT; once submitted the
 * claim is read-only from this flow (the confirmation screen reads it via the
 * page, not through here).
 */
async function currentClaim(): Promise<ClaimContext> {
  const session = await getClaimSession();
  if (!session) return { ok: false, error: NO_CLAIM };
  const repo = getRepository();
  const claim = await repo.getClaimById(session.claimId);
  if (!claim || claim.status !== "draft") return { ok: false, error: NO_CLAIM };
  return { ok: true, repo, claim };
}

/* -------------------------------------------------------------------------- */
/* Entry (landing form): identify + contact, then into the flow               */
/* -------------------------------------------------------------------------- */

/** Netlify's edge IP header, like lib/actions/lookup-guard.ts. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const nf = h.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

/** Anonymous claim creation is throttled per IP — fail-open, never an outage. */
async function guardEntryAttempt(): Promise<boolean> {
  try {
    const repo = getRepository();
    const check = await enforceRateLimit(repo.bumpRateCounter.bind(repo), {
      bucket: "claim_entry_ip",
      key: await clientIp(),
      windowSeconds: 900,
      limit: 10,
    });
    return check.allowed;
  } catch {
    return true;
  }
}

/**
 * The landing form: validate, open the anonymous draft, remember it in the
 * claimant cookie, and step into the flow. On success this REDIRECTS to
 * /claim; only a failure returns a result.
 */
export async function startClaimAction(form: FormData): Promise<ActionResult> {
  const entry = validateClaimEntry({
    firstName: line(form.get("firstName")),
    lastName: line(form.get("lastName")),
    salesOrderNumber: line(form.get("salesOrderNumber")),
    deliveryZip: line(form.get("deliveryZip")),
    contactEmail: line(form.get("contactEmail")),
    contactPhone: line(form.get("contactPhone")),
  });
  if (!entry.ok) return { ok: false, error: entry.error };

  if (!(await guardEntryAttempt())) return { ok: false, error: TOO_MANY };

  const repo = getRepository();
  const claim = await repo.createAnonymousClaim({
    firstName: entry.value.firstName,
    lastName: entry.value.lastName,
    deliveryZip: entry.value.deliveryZip,
  });
  await repo.updateClaim(claim.id, {
    salesOrderNumber: entry.value.salesOrderNumber,
    contactEmail: entry.value.contactEmail,
    contactPhone: entry.value.contactPhone,
    contactPhoneKind: entry.value.contactPhone ? "mobile" : null,
    step: "items",
  });
  await setClaimSession(claim.id);
  redirect("/claim");
}

/* -------------------------------------------------------------------------- */
/* Purchase details (spec §2.4)                                               */
/* -------------------------------------------------------------------------- */

export interface ClaimDetailsResult {
  day: number;
  message: string;
}

export async function saveClaimDetails(form: FormData): Promise<
  ActionResult<ClaimDetailsResult>
> {
  const ctx = await currentClaim();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const modelNumber = line(form.get("modelNumber"));
  const purchaseDate = plainDate(line(form.get("purchaseDate")));
  const deliveryDate = plainDate(line(form.get("deliveryDate")));
  const salesOrderNumber = line(form.get("salesOrderNumber"));
  const earlyRaw = line(form.get("earlyPreference"));

  if (!modelNumber) {
    return {
      ok: false,
      error: "Please add the model number — it's on the tag or your receipt.",
    };
  }
  if (!purchaseDate || !deliveryDate) {
    return {
      ok: false,
      error: "Please add both dates — when you bought it, and when it arrived.",
    };
  }

  const day = journeyDay(deliveryDate, new Date());
  let earlyPreference: EarlyPreference | null = null;
  if (earlyPreferenceRequired(day)) {
    if (!isEarlyPreference(earlyRaw)) {
      return {
        ok: false,
        error:
          "Since it's not quite night 31 yet, tell us how you'd like to handle the wait — start automatically on day 31, or have an agent call.",
      };
    }
    earlyPreference = earlyRaw;
  }

  await ctx.repo.updateClaim(ctx.claim.id, {
    modelNumber,
    purchaseDate,
    deliveryDate,
    // Only fill the order number if entry didn't already have it.
    ...(salesOrderNumber && !ctx.claim.salesOrderNumber?.trim()
      ? { salesOrderNumber }
      : {}),
    // Normalized every save: null once the date puts them in (or past) window.
    earlyPreference,
    step: "confirmations",
  });

  const { message } = dayCountMessage(deliveryDate);
  return { ok: true, data: { day, message } };
}

/* -------------------------------------------------------------------------- */
/* R-2 — persist the resume point when the customer steps back                */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors saveStep() for the fitting (lib/actions/fitting.ts:113). Moving back
 * has to survive a reload, or Back would silently undo itself.
 *
 * BACKWARD ONLY, against the claim's own persisted step. currentClaim() checks
 * the claim's STATUS, not its step, so without this an earlier version accepted
 * any stage a client sent — `done` included, which persists as `"submitted"` and
 * left a live draft with no Back, no claim number and no way to the fields it
 * still needed (adversarial review, 2026-08-19). Forward progress is written by
 * the step actions, as a side effect of the work they validate.
 */
export async function saveClaimStage(stage: ClaimStage): Promise<ActionResult> {
  const ctx = await currentClaim();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const current = stageForStep(ctx.claim.step ?? "intake");
  if (!isBackwardStage(current, stage)) return { ok: false, error: NO_CLAIM };
  await ctx.repo.updateClaim(ctx.claim.id, { step: stepForStage(stage) });
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Qualification checkboxes (spec §2.5)                                       */
/* -------------------------------------------------------------------------- */

export async function saveClaimQualifications(input: {
  confirmations: ConfirmationKey[];
  protectorUsed: boolean;
}): Promise<ActionResult> {
  const ctx = await currentClaim();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const confirmations = normalizeConfirmations(input.confirmations);
  if (confirmations.length < CONFIRMATION_TERMS.length) {
    return {
      ok: false,
      error: "Each of these needs to be true before we can take the request on.",
    };
  }

  await ctx.repo.updateClaim(ctx.claim.id, {
    confirmations,
    protectorUsed: Boolean(input.protectorUsed),
    step: "photos",
  });
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Photos — optional, never blocking (spec §2.6)                              */
/* -------------------------------------------------------------------------- */

export interface CapturedClaimPhoto {
  angle: PhotoAngle;
  label: string;
  fileName: string | null;
  storagePath: string | null;
  stored: boolean;
}

export async function captureClaimPhoto(
  form: FormData
): Promise<ActionResult<CapturedClaimPhoto>> {
  const ctx = await currentClaim();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const angle = String(form.get("angle") ?? "") as PhotoAngle;
  const target = CLAIM_PHOTO_TARGETS.find((t) => t.angle === angle);
  if (!target) return { ok: false, error: "That photo isn't part of this request." };

  const file = form.get("file");
  const hasBytes = typeof File !== "undefined" && file instanceof File && file.size > 0;

  let storagePath: string | null = null;
  let stored = false;
  if (hasBytes) {
    // Reject oversized/non-image files BEFORE reading bytes (audit #8 rule).
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

  const fileName = hasBytes
    ? (file as File).name
    : String(form.get("fileName") ?? "") || null;

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

/** Continue past photos — with any number captured, including none. */
export async function finishClaimPhotos(): Promise<ActionResult> {
  const ctx = await currentClaim();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  await ctx.repo.updateClaim(ctx.claim.id, { step: "verify" });
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Submit (spec §2.8)                                                         */
/* -------------------------------------------------------------------------- */

export interface SubmittedClaim {
  claimNumber: string;
}

export async function submitAnonymousClaim(): Promise<ActionResult<SubmittedClaim>> {
  const ctx = await currentClaim();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const readiness = claimReadyToSubmit(ctx.claim);
  if (!readiness.ready) {
    return { ok: false, error: "There's still a little left to gather." };
  }

  // Normalize the early choice at the moment of truth: kept when still early,
  // cleared when the date now lands in (or past) the window.
  const day = ctx.claim.deliveryDate ? journeyDay(ctx.claim.deliveryDate) : null;
  const earlyPreference =
    day !== null && earlyPreferenceRequired(day)
      ? ctx.claim.earlyPreference ?? null
      : null;

  const result = await ctx.repo.submitClaim(ctx.claim.id, { earlyPreference });
  return { ok: true, data: { claimNumber: result.claimNumber } };
}

/** Leave the flow cleanly (the confirmation screen's "start another"). */
export async function clearClaimSessionAction(): Promise<void> {
  await clearClaimSession();
  redirect("/");
}
