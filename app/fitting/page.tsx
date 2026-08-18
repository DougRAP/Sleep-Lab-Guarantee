import { redirect } from "next/navigation";
import Link from "next/link";
import { LivingSky } from "../../components/living-sky";
import { AppHeader } from "../../components/app-header";
import { DayCount } from "../../components/day-count";
import { ConciergeCard } from "../../components/concierge-card";
import { DemoControls } from "../../components/demo/demo-controls";
import { BottomNav } from "../../components/nav/bottom-nav";
import { FittingFlow } from "../../components/fitting/fitting-flow";
import { buttonVariants } from "../../components/ui/button";
import { isPreVerifiedSession, requireGuarantee } from "../../lib/auth/app-session";
import { getRepository } from "../../lib/data";
import { effectiveReferenceDate } from "../../lib/demo-server";
import { evaluateEligibility } from "../../lib/eligibility";
import { photoTargetsFor, resumeStep } from "../../lib/fitting";
import { intakeGreeting } from "../../lib/fitting-intake";
import { hasAnthropicKey } from "../../lib/concierge";
import { claimPhotoThumbs, isPhotoStorageConfigured } from "../../lib/storage";
import { cn } from "../../lib/utils";

/**
 * The fitting — the claim triage the Exchange button kicks off (v2 #2, M5).
 *
 * Lives outside the (app) route group, but since the 2026-07-22 review it renders
 * the same sticky header and bottom nav as every other page: the footer is the
 * customer's escape route, so it must never disappear mid-exchange.
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
          className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
        >
          <AppHeader email={session.email} />
          <div className="flex flex-1 flex-col justify-center gap-6 py-10">
            <DayCount day={elig.day} className="block" />
            <ConciergeCard>{elig.reasons[0]?.message}</ConciergeCard>
            <Link
              href="/guarantee"
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
            >
              Back to your guarantee
            </Link>
          </div>
        </main>
        <DemoControls aboveNav />
        <BottomNav />
      </>
    );
  }

  // Resume an open draft if there is one. Merely OPENING this page creates
  // nothing (Emmy's ghost fix, 2026-07-23): the draft is born lazily inside
  // the first server action, so an untouched visit leaves no trace.
  const claim = await repo.getDraftClaim(guarantee.id);
  const [items, photos, dealer] = await Promise.all([
    claim ? repo.listClaimItems(claim.id) : Promise.resolve([]),
    claim ? repo.listClaimPhotos(claim.id) : Promise.resolve([]),
    repo.getDealerLocationForGuarantee(guarantee.id),
  ]);

  const preVerified = claim?.preVerified ?? isPreVerifiedSession(session);
  const step = claim ? resumeStep({ claim, items, photos }) : "intake";
  // Signed thumbnails for persisted photos, so a return visit shows what was
  // already captured rather than empty "Retake" tiles.
  const photoThumbs = claim ? await claimPhotoThumbs(photos) : {};

  return (
    <>
      <LivingSky day={elig.day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={session.email} />

        <DayCount day={elig.day} className="mt-8 block" />
        <h1 className="mt-2 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
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
            photoTargets={photoTargetsFor(preVerified)}
            capturedAngles={photos.filter((p) => p.captured).map((p) => p.angle)}
            photoThumbs={photoThumbs}
            items={items}
            confirmations={claim?.confirmations ?? []}
            intake={{
              reasonExperience: claim?.reasonExperience ?? "",
              preferredReplacement: claim?.preferredReplacement ?? "",
            }}
            verify={{
              contactPhone: claim?.contactPhone ?? guarantee.customerPhone ?? "",
              contactPhoneKind: claim?.contactPhoneKind ?? null,
              contactEmail: claim?.contactEmail ?? guarantee.customerEmail ?? "",
              atDeliveryAddress: claim?.atDeliveryAddress ?? null,
              newAddress: claim?.newAddress ?? "",
              stillOwns: claim?.stillOwns === true,
            }}
            submitted={
              claim?.raNumber && claim?.trackingNumber
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
      <DemoControls aboveNav />
      <BottomNav />
    </>
  );
}
