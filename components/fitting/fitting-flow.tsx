"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProgressDots } from "./progress-dots";
import { IntakeStep } from "./intake-step";
import { ItemsStep } from "./items-step";
import { ConfirmationsStep } from "./confirmations-step";
import { PhotosStep, type PhotoTargetView } from "./photos-step";
import { VerifyStep } from "./verify-step";
import { SubmittedStep } from "./submitted-step";
import { previousStep } from "../../lib/fitting";
import { saveStep } from "../../lib/actions/fitting";
import type {
  ClaimItem,
  ConfirmationKey,
  FittingStep,
  PhoneKind,
  PhotoAngle,
} from "../../lib/types";

export interface FittingFlowProps {
  /** Where the customer left off (server-resolved from the persisted draft). */
  initialStep: FittingStep;
  aiEnabled: boolean;
  storageConfigured: boolean;
  greeting: string;
  photoTargets: PhotoTargetView[];
  capturedAngles: PhotoAngle[];
  /** Signed URLs for persisted photos, keyed by angle (may be empty). */
  photoThumbs?: Partial<Record<PhotoAngle, string>>;
  items: ClaimItem[];
  confirmations: ConfirmationKey[];
  intake: { reasonExperience: string; preferredReplacement: string };
  verify: {
    contactPhone: string;
    contactPhoneKind: PhoneKind | null;
    contactEmail: string;
    atDeliveryAddress: boolean | null;
    newAddress: string;
    stillOwns: boolean;
  };
  /** v3: the CG claim number a submitted request already carries, if any. */
  submitted: { claimNumber: string; dealerName: string | null } | null;
}

/**
 * The fitting — one calm step per screen. The current step is persisted after
 * every move, so leaving and coming back resumes here rather than restarting.
 * Since the 2026-07-22 review the page around it keeps the sticky header and
 * bottom nav visible — the footer is the customer's escape route.
 */
export function FittingFlow(props: FittingFlowProps) {
  const [step, setStep] = useState<FittingStep>(props.initialStep);
  const [result, setResult] = useState(props.submitted);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function go(next: FittingStep) {
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    startTransition(async () => {
      // Persist the resume point, then pull fresh server props. The refresh is
      // what makes going *back* honest: a step remounts with what was actually
      // saved, not the values this page was first rendered with.
      await saveStep(next);
      router.refresh();
    });
  }

  // Back sits beside each step's own button, the way a wizard reads (Adrian,
  // 2026-08-20). The rule that decides where it goes is unchanged; only where
  // the control is drawn. The first step has no Back: "Leave for now" below is
  // the way out of the flow.
  const back = step === "submitted" ? null : previousStep(step);
  const onBack = back ? () => go(back) : undefined;

  if (step === "submitted" && result) {
    return (
      <SubmittedStep claimNumber={result.claimNumber} dealerName={result.dealerName} />
    );
  }

  return (
    <div className="space-y-7">
      <ProgressDots step={step} />

      {/*
        Each step is keyed by the saved values it starts from. When a refresh
        brings fresh server props, the key changes and the step remounts with
        what was actually persisted — so stepping back never shows stale entries.
      */}
      {step === "intake" && (
        <IntakeStep
          key={`${props.intake.reasonExperience}|${props.intake.preferredReplacement}`}
          aiEnabled={props.aiEnabled}
          greeting={props.greeting}
          initialReason={props.intake.reasonExperience}
          initialPreference={props.intake.preferredReplacement}
          onBack={onBack}
          onDone={() => go("items")}
        />
      )}

      {step === "items" && (
        <ItemsStep
          key={props.items.map((i) => i.id).join(",")}
          initial={props.items}
          onBack={onBack}
          onDone={() => go("confirmations")}
        />
      )}

      {step === "confirmations" && (
        <ConfirmationsStep
          key={props.confirmations.join(",")}
          initial={props.confirmations}
          onBack={onBack}
          onDone={() => go("photos")}
        />
      )}

      {step === "photos" && (
        <PhotosStep
          targets={props.photoTargets}
          capturedAngles={props.capturedAngles}
          storageConfigured={props.storageConfigured}
          initialThumbs={props.photoThumbs}
          onBack={onBack}
          onDone={() => go("verify")}
        />
      )}

      {step === "verify" && (
        <VerifyStep
          key={`${props.verify.contactPhone}|${props.verify.contactEmail}|${props.verify.atDeliveryAddress}|${props.verify.stillOwns}`}
          onBack={onBack}
          initial={props.verify}
          onSubmitted={(r) => {
            setResult(r);
            setStep("submitted");
            if (typeof window !== "undefined") window.scrollTo({ top: 0 });
          }}
        />
      )}

      <div className="border-t border-[var(--line)] pt-5">
        <Link
          href="/guarantee"
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
        >
          Leave for now &mdash; we&apos;ll keep your place
        </Link>
      </div>
    </div>
  );
}
