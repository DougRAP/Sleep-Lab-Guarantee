"use client";

import * as React from "react";
import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConciergeCard } from "../concierge-card";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { FrostedCard } from "../ui/frosted-card";
import { StepActions } from "../ui/step-actions";
import { Stat } from "../ui/stat";
import { ConfirmRow } from "../fitting/confirm-row";
import { StillNeeded } from "../fitting/still-needed";
import { PhotosStep } from "../fitting/photos-step";
import {
  captureClaimPhoto,
  finishClaimPhotos,
  saveClaimDetails,
  saveClaimQualifications,
  saveClaimStage,
  submitAnonymousClaim,
} from "../../lib/actions/claim";
import {
  dayCountMessage,
  earlyPreferenceRequired,
  previousStage,
  type ClaimStage,
} from "../../lib/claim-flow";
import { CLAIM_PHOTO_TARGETS, CONFIRMATION_TERMS } from "../../lib/fitting";
import { COMFORT_EXCHANGE_FEE } from "../../lib/eligibility";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../../content/support";
import type { ConfirmationKey, EarlyPreference, PhotoAngle } from "../../lib/types";

export interface ClaimFlowProps {
  initialStage: ClaimStage;
  storageConfigured: boolean;
  authConfigured: boolean;
  details: {
    modelNumber: string;
    purchaseDate: string;
    deliveryDate: string;
    /** True when the entry form already captured the order number. */
    hasSalesOrder: boolean;
    earlyPreference: EarlyPreference | null;
  };
  confirmations: ConfirmationKey[];
  protectorUsed: boolean;
  capturedAngles: PhotoAngle[];
  photoThumbs: Partial<Record<PhotoAngle, string>>;
  /** Set when the claim is already submitted (a return visit). */
  claimNumber: string | null;
}

export function ClaimFlow(props: ClaimFlowProps) {
  const [stage, setStage] = useState<ClaimStage>(
    props.claimNumber ? "done" : props.initialStage
  );
  const [claimNumber, setClaimNumber] = useState<string | null>(props.claimNumber);
  const [pending, startTransition] = useTransition();

  /**
   * R-2: the flow owns what the customer has entered, seeded from the server.
   *
   * The first cut copied the fitting's mechanism — persist, router.refresh(),
   * and key each step by its saved values — and the adversarial review broke it
   * with a throttled browser: setStage is synchronous while fresh props are two
   * round trips away, so Back landed on an EMPTY form, and anything typed in
   * that window was wiped when the refresh finally arrived and the key remounted
   * the step. Worse, the step posts its local state and saveClaimDetails
   * overwrites unconditionally, so a stale value could be written back over a
   * correction the customer had already saved.
   *
   * Holding the values here removes the window rather than narrowing it: there
   * is nothing to wait for, so Back is instant and always shows what was saved.
   * The brief allowed exactly this, and asked that it be proved by the e2e
   * rather than argued (e2e/claims/back.spec.ts asserts it without polling).
   * It also drops four full dynamic re-renders per claim.
   */
  const [details, setDetails] = useState(props.details);
  const [confirmations, setConfirmations] = useState(props.confirmations);
  const [protectorUsed, setProtectorUsed] = useState(props.protectorUsed);
  const [captured, setCaptured] = useState(props.capturedAngles);

  /**
   * Every move goes through one door. Persisting the resume point is all the
   * server is asked for; the screen never waits on it. The re-entry guard is
   * the house pattern (see each step's submit): without it three fast taps fire
   * three unordered writes and the persisted step can end ahead of the screen,
   * which is the "Back undoes itself on reload" failure this exists to prevent.
   */
  const go = useCallback(
    (next: ClaimStage) => {
      if (pending) return;
      setStage(next);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
      // Backward only, and re-checked server-side. A failure here means the
      // claimant cookie died, and the next render redirects to the front door.
      if (previousStage(stage) === next) {
        startTransition(async () => {
          await saveClaimStage(next);
        });
      }
    },
    [pending, stage]
  );

  const router = useRouter();

  /**
   * Where Back goes from here. The flow starts at Get started, so the first
   * step reaches back to the front door rather than dead-ending: the form
   * there arrives filled in, and saving it edits this same request.
   * Once the claim number exists there is no back at all.
   */
  const onBack = React.useMemo(() => {
    if (claimNumber) return undefined;
    const prev = previousStage(stage);
    if (prev) return () => go(prev);
    return () => {
      if (pending) return;
      router.push("/");
    };
  }, [claimNumber, stage, go, pending, router]);
  const backLabel = previousStage(stage)
    ? "Back to the previous step"
    : "Back to your details";

  if (stage === "done" && claimNumber) {
    return <DoneScreen claimNumber={claimNumber} authConfigured={props.authConfigured} />;
  }

  // No `key` on any step. Every stage returns a different component type, so
  // React remounts regardless; the keys the first cut carried were inert except
  // in the race window, where the photos one destroyed a just-taken capture by
  // remounting the step and revoking its object URLs.
  switch (stage) {
    case "details":
      return (
        <DetailsStep
          onBack={onBack}
          backLabel={backLabel}
          initial={details}
          onDone={(saved) => {
            setDetails(saved);
            go("qualification");
          }}
        />
      );
    case "qualification":
      return (
        <QualificationStep
          onBack={onBack}
          initialConfirmations={confirmations}
          initialProtector={protectorUsed}
          onDone={(saved, protector) => {
            setConfirmations(saved);
            setProtectorUsed(protector);
            go("photos");
          }}
        />
      );
    case "photos":
      return (
        <ClaimPhotos
          onBack={onBack}
          storageConfigured={props.storageConfigured}
          capturedAngles={captured}
          photoThumbs={props.photoThumbs}
          onCaptured={setCaptured}
          onDone={(saved) => {
            setCaptured(saved);
            go("process");
          }}
        />
      );
    default:
      return (
        <ProcessStep
          onBack={onBack}
          onSubmitted={(cg) => {
            setClaimNumber(cg);
            setStage("done");
          }}
        />
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Step 1 — purchase details + the day count (spec §2.4)                      */
/* -------------------------------------------------------------------------- */

function DetailsStep({
  onBack,
  backLabel,
  initial,
  onDone,
}: {
  onBack?: () => void;
  backLabel?: string;
  initial: ClaimFlowProps["details"];
  /** Hands the saved values up, so Back can show them without a round trip. */
  onDone: (saved: ClaimFlowProps["details"]) => void;
}) {
  const [modelNumber, setModelNumber] = useState(initial.modelNumber);
  const [purchaseDate, setPurchaseDate] = useState(initial.purchaseDate);
  const [deliveryDate, setDeliveryDate] = useState(initial.deliveryDate);
  const [salesOrderNumber, setSalesOrderNumber] = useState("");
  const [early, setEarly] = useState<EarlyPreference | null>(initial.earlyPreference);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The day count reacts as the date is typed — same pure rule the server
  // re-applies on save, so the message can never disagree with the record.
  const dayInfo = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate.trim())) return null;
    return dayCountMessage(deliveryDate.trim());
  }, [deliveryDate]);
  const needsEarlyChoice = dayInfo ? earlyPreferenceRequired(dayInfo.day) : false;

  function submit() {
    if (pending) return;
    startTransition(async () => {
      const form = new FormData();
      form.set("modelNumber", modelNumber);
      form.set("purchaseDate", purchaseDate);
      form.set("deliveryDate", deliveryDate);
      form.set("salesOrderNumber", salesOrderNumber);
      if (needsEarlyChoice && early) form.set("earlyPreference", early);
      const res = await saveClaimDetails(form);
      if (res.ok) {
        onDone({
          modelNumber,
          purchaseDate,
          deliveryDate,
          // Either it arrived with one, or this step just supplied it.
          hasSalesOrder: initial.hasSalesOrder || Boolean(salesOrderNumber.trim()),
          // Mirrors the server: normalized to null once the date is in window.
          earlyPreference: needsEarlyChoice ? early : null,
        });
      } else setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <ConciergeCard>
        A few details about the mattress itself — they're on the tag at the foot
        of the bed and on your receipt.
      </ConciergeCard>

      <Field
        label="Model number"
        autoComplete="off"
        value={modelNumber}
        onChange={(e) => setModelNumber(e.target.value)}
        hint="From the tag on the mattress, or your receipt."
      />
      {!initial.hasSalesOrder && (
        <Field
          label="Sales order number"
          autoComplete="off"
          value={salesOrderNumber}
          onChange={(e) => setSalesOrderNumber(e.target.value)}
          hint="If it's handy — it helps us find your purchase."
        />
      )}
      <Field
        label="Date of purchase"
        type="date"
        value={purchaseDate}
        onChange={(e) => setPurchaseDate(e.target.value)}
      />
      <Field
        label="Date of delivery"
        type="date"
        value={deliveryDate}
        onChange={(e) => setDeliveryDate(e.target.value)}
        hint="When it was delivered to you."
      />

      {dayInfo && (
        <ConciergeCard>
          {dayInfo.message}
        </ConciergeCard>
      )}

      {needsEarlyChoice && (
        <div className="space-y-2" role="radiogroup" aria-label="How to handle the early start">
          <ConfirmRow
            checked={early === "auto_submit_day_31"}
            onToggle={() => setEarly("auto_submit_day_31")}
          >
            Submit now and start my exchange automatically on day 31.
          </ConfirmRow>
          <ConfirmRow
            checked={early === "agent_call"}
            onToggle={() => setEarly("agent_call")}
          >
            Have an agent call me to talk it through.
          </ConfirmRow>
        </div>
      )}

      <div aria-live="polite" className="min-h-[1.25rem]">
        {error && <p className="text-[13px] text-mist">{error}</p>}
      </div>

      <StepActions onBack={onBack} backLabel={backLabel}>
        <Button
          onClick={submit}
          disabled={pending || (needsEarlyChoice && !early)}
        >
          Next — a few confirmations
        </Button>
      </StepActions>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 — qualification checkboxes (spec §2.5)                              */
/* -------------------------------------------------------------------------- */

function QualificationStep({
  onBack,
  initialConfirmations,
  initialProtector,
  onDone,
}: {
  onBack?: () => void;
  initialConfirmations: ConfirmationKey[];
  initialProtector: boolean;
  onDone: (confirmations: ConfirmationKey[], protectorUsed: boolean) => void;
}) {
  const [checked, setChecked] = useState<Set<ConfirmationKey>>(
    new Set(initialConfirmations)
  );
  const [protectorUsed, setProtectorUsed] = useState(initialProtector);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(key: ConfirmationKey) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const missing = CONFIRMATION_TERMS.filter((t) => !checked.has(t.key));
  const ready = missing.length === 0;

  function submit() {
    if (!ready || pending) return;
    startTransition(async () => {
      const res = await saveClaimQualifications({
        confirmations: [...checked],
        protectorUsed,
      });
      if (res.ok) onDone([...checked], protectorUsed);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <ConciergeCard>
        A few things the guarantee asks us to confirm together. Read each one
        and tap it if it&apos;s true for you.
      </ConciergeCard>

      <div className="space-y-2">
        {CONFIRMATION_TERMS.map((term) => (
          <ConfirmRow
            key={term.key}
            checked={checked.has(term.key)}
            onToggle={() => toggle(term.key)}
          >
            {term.statement}
          </ConfirmRow>
        ))}
      </div>

      {/* Informational only — never required (Doug, spec §2.5). */}
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
          One more, just for our notes — not required
        </p>
        <ConfirmRow checked={protectorUsed} onToggle={() => setProtectorUsed((v) => !v)}>
          I&apos;ve been using a mattress protector.
        </ConfirmRow>
      </div>

      <StillNeeded items={missing.map((t) => t.statement)} />

      <div aria-live="polite" className="min-h-[1.25rem]">
        {error && <p className="text-[13px] text-mist">{error}</p>}
      </div>

      <StepActions onBack={onBack}>
        <Button onClick={submit} disabled={!ready || pending}>
          Next — photos, if you&apos;d like
        </Button>
      </StepActions>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3 — photos, all optional (spec §2.6)                                  */
/* -------------------------------------------------------------------------- */

function ClaimPhotos({
  onBack,
  storageConfigured,
  capturedAngles,
  photoThumbs,
  onCaptured,
  onDone,
}: {
  onBack?: () => void;
  storageConfigured: boolean;
  capturedAngles: PhotoAngle[];
  photoThumbs: Partial<Record<PhotoAngle, string>>;
  /** Each capture as it lands, so leaving and returning keeps the progress. */
  onCaptured: (captured: PhotoAngle[]) => void;
  onDone: (captured: PhotoAngle[]) => void;
}) {
  return (
    <PhotosStep
      targets={CLAIM_PHOTO_TARGETS}
      capturedAngles={capturedAngles}
      storageConfigured={storageConfigured}
      initialThumbs={photoThumbs}
      capture={captureClaimPhoto}
      finish={finishClaimPhotos}
      intro={
        <>
          Photos are optional and speed the review — since we may send a
          technician, we can always complete them later. If you do take them,
          remove all bedding, linens, and any mattress protector first.
        </>
      }
      nextLabel="Continue — I can skip these"
      onBack={onBack}
      onCaptured={onCaptured}
      onDone={onDone}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Step 4 — how the process works, then submit (spec §2.7–§2.8)               */
/* -------------------------------------------------------------------------- */

function ProcessStep({
  onBack,
  onSubmitted,
}: {
  onBack?: () => void;
  onSubmitted: (claimNumber: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const steps = [
    "We review your request.",
    "We may send a technician to take a look — we'll always call you first.",
    "If approved, we issue an exchange authorization and send it by text or email.",
    `City Mattress schedules the pickup and exchange. You pay them the $${COMFORT_EXCHANGE_FEE} comfort exchange fee (California King sets carry an added restocking fee), plus any price difference on the new mattress.`,
  ];

  function submit() {
    if (pending) return;
    startTransition(async () => {
      const res = await submitAnonymousClaim();
      if (res.ok) onSubmitted(res.data.claimNumber);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <ConciergeCard>Here&apos;s how it goes from here.</ConciergeCard>

      <FrostedCard>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-cloud/90">
              <span className="font-mono text-[13px] text-dawn">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </FrostedCard>

      <div aria-live="polite" className="min-h-[1.25rem]">
        {error && <p className="text-[13px] text-mist">{error}</p>}
      </div>

      <StepActions onBack={onBack}>
        <Button onClick={submit} disabled={pending}>
          Send my request
        </Button>
      </StepActions>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirmation — the CG number (spec §2.8)                                   */
/* -------------------------------------------------------------------------- */

function DoneScreen({
  claimNumber,
  authConfigured,
}: {
  claimNumber: string;
  authConfigured: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(claimNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the number is right there to select.
    }
  }

  return (
    <div className="space-y-6">
      <ConciergeCard>
        It&apos;s in. Your request is with us now — here&apos;s your claim number.
      </ConciergeCard>

      <FrostedCard className="space-y-4">
        <Stat label="Your claim number" value={claimNumber} />
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-dawn transition-colors hover:text-cloud"
        >
          {copied ? "Copied" : "Copy the number"}
        </button>
        <p className="text-[13px] leading-relaxed text-mist">
          Save this number — it&apos;s how we&apos;ll both refer to your request
          from here.
        </p>
      </FrostedCard>

      <FrostedCard className="space-y-3">
        <p className="text-[15px] leading-relaxed text-cloud/90">
          We&apos;ll review your request and reach out by the contact you gave
          us. Nothing else is needed from you right now.
        </p>
        {authConfigured && (
          <p className="text-[13px] leading-relaxed text-mist">
            Want to follow along?{" "}
            <Link
              href="/login"
              className="text-dawn underline-offset-4 transition-colors hover:underline"
            >
              Create an account or log in
            </Link>{" "}
            to track your request.
          </p>
        )}
        <p className="text-[13px] leading-relaxed text-mist">
          Anytime, you can call us at {SUPPORT_PHONE} or email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-dawn underline-offset-4 transition-colors hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </FrostedCard>
    </div>
  );
}
