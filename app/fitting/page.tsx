import { redirect } from "next/navigation";
import Link from "next/link";
import { LivingSky } from "../../components/living-sky";
import { Logo } from "../../components/Logo";
import { DayCount } from "../../components/day-count";
import { ConciergeCard } from "../../components/concierge-card";
import { DemoControls } from "../../components/demo/demo-controls";
import { FittingFlow } from "../../components/fitting/fitting-flow";
import { buttonVariants } from "../../components/ui/button";
import { isPreVerifiedSession, requireGuarantee } from "../../lib/auth/app-session";
import { getRepository } from "../../lib/data";
import { effectiveReferenceDate } from "../../lib/demo-server";
import { evaluateEligibility } from "../../lib/eligibility";
import { photoTargetsFor, resumeStep } from "../../lib/fitting";
import { intakeGreeting } from "../../lib/fitting-intake";
import { hasAnthropicKey } from "../../lib/concierge";
import { isPhotoStorageConfigured } from "../../lib/storage";
import { cn } from "../../lib/utils";

/**
 * The fitting — the claim triage the Exchange button kicks off (v2 #2, M5).
 *
 * Lives OUTSIDE the (app) route group on purpose: focused flows stay full-bleed,
 * one-breath screens with no bottom nav (DESIGN.md "Hidden during focused flows").
 * Session-guarded, and gated on the day 31–90 window evaluated at the *effective*
 * reference date, so the demo day-jumper opens the gate exactly as real time would.
 */
export default async function FittingPage() {
  const { session, guarantee } = await requireGuarantee();
  const repo = getRepository();

  const referenceDate = await effectiveReferenceDate(guarantee.deliveryDate);
  const resolvedExchange = await repo.hasResolvedExchange(guarantee.id);
  const elig = evaluateEligibility({
    deliveryDate: guarantee.deliveryDate,
    referenceDate,
    exchangeResolved: resolvedExchange,
  });

  // Not in the window — say so calmly and send them back, never a hard error.
  if (!elig.eligible) {
    return (
      <>
        <LivingSky day={elig.day} />
        <main
          id="main"
          className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-10 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
        >
          <div className="flex items-center justify-between">
            <Logo />
            <DayCount day={elig.day} />
          </div>
          <div className="flex flex-1 flex-col justify-center gap-6 py-10">
            <ConciergeCard>{elig.reasons[0]?.message}</ConciergeCard>
            <Link
              href="/guarantee"
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
            >
              Back to your guarantee
            </Link>
          </div>
        </main>
        <DemoControls />
      </>
    );
  }

  // Open (or resume) the draft, then read everything back.
  const claim = await repo.createDraftClaim({
    guaranteeId: guarantee.id,
    preVerified: isPreVerifiedSession(session),
  });
  const [items, photos, dealer] = await Promise.all([
    repo.listClaimItems(claim.id),
    repo.listClaimPhotos(claim.id),
    repo.getDealerLocationForGuarantee(guarantee.id),
  ]);

  const step = resumeStep({ claim, items, photos });

  return (
    <>
      <LivingSky day={elig.day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-14 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <DayCount day={elig.day} />
        </div>

        <h1 className="mt-8 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
          Your comfort exchange
        </h1>

        <div className="mt-6">
          <FittingFlow
            initialStep={step}
            aiEnabled={hasAnthropicKey()}
            storageConfigured={isPhotoStorageConfigured()}
            greeting={intakeGreeting({
              firstName: guarantee.customerFirstName?.trim() || null,
            })}
            photoTargets={photoTargetsFor(claim.preVerified)}
            capturedAngles={photos.filter((p) => p.captured).map((p) => p.angle)}
            items={items}
            confirmations={claim.confirmations ?? []}
            intake={{
              reasonExperience: claim.reasonExperience ?? "",
              preferredReplacement: claim.preferredReplacement ?? "",
            }}
            verify={{
              contactPhone: claim.contactPhone ?? guarantee.customerPhone ?? "",
              contactPhoneKind: claim.contactPhoneKind ?? null,
              contactEmail: claim.contactEmail ?? guarantee.customerEmail ?? "",
              atDeliveryAddress: claim.atDeliveryAddress ?? null,
              newAddress: claim.newAddress ?? "",
              stillOwns: claim.stillOwns === true,
            }}
            submitted={
              claim.raNumber && claim.trackingNumber
                ? {
                    raNumber: claim.raNumber,
                    trackingNumber: claim.trackingNumber,
                    dealerName: dealer?.name ?? guarantee.dealerName ?? null,
                  }
                : null
            }
          />
        </div>
      </main>
      <DemoControls />
    </>
  );
}
