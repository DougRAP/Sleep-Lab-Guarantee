import { redirect } from "next/navigation";
import { LivingSky } from "../../components/living-sky";
import { Logo } from "../../components/Logo";
import { ClaimFlow, type ClaimStage } from "../../components/claim/claim-flow";
import { getClaimSession } from "../../lib/claim-session";
import { getRepository } from "../../lib/data";
import { isAuthConfigured } from "../../lib/auth/config";
import { claimPhotoThumbs, isPhotoStorageConfigured } from "../../lib/storage";
import type { FittingStep } from "../../lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Request an exchange · RAP Sleep Lab" };

/**
 * The v3 anonymous exchange request (spec §2) — a focused flow like /fitting:
 * no bottom nav, no account, carried by the claimant cookie alone. No cookie
 * (or a stale one) lands back on the front door, where the entry form starts a
 * fresh request.
 *
 * The stored `step` column doubles as the resume point; its legacy values map
 * onto the v3 stages (items→details, confirmations→qualification, photos,
 * verify→process) so no schema change was needed.
 */
const STAGE_BY_STEP: Record<FittingStep, ClaimStage> = {
  intake: "details",
  items: "details",
  confirmations: "qualification",
  photos: "photos",
  verify: "process",
  submitted: "done",
};

export default async function ClaimPage() {
  const session = await getClaimSession();
  if (!session) redirect("/");

  const repo = getRepository();
  const claim = await repo.getClaimById(session.claimId);
  if (!claim) redirect("/");

  const photos = await repo.listClaimPhotos(claim.id);
  const photoThumbs = await claimPhotoThumbs(photos);
  const submitted = claim.status !== "draft";

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-12 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
      >
        <div>
          <Logo />
        </div>

        <h1 className="mt-8 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
          {submitted ? "Your exchange request" : "Request an exchange"}
        </h1>

        <div className="mt-6">
          <ClaimFlow
            initialStage={STAGE_BY_STEP[claim.step ?? "intake"]}
            storageConfigured={isPhotoStorageConfigured()}
            authConfigured={isAuthConfigured()}
            details={{
              modelNumber: claim.modelNumber ?? "",
              purchaseDate: claim.purchaseDate ?? "",
              deliveryDate: claim.deliveryDate ?? "",
              hasSalesOrder: Boolean(claim.salesOrderNumber?.trim()),
              earlyPreference: claim.earlyPreference ?? null,
            }}
            confirmations={claim.confirmations ?? []}
            protectorUsed={claim.protectorUsed ?? false}
            capturedAngles={photos.filter((p) => p.captured).map((p) => p.angle)}
            photoThumbs={photoThumbs}
            claimNumber={submitted ? claim.claimNumber ?? null : null}
          />
        </div>
      </main>
    </>
  );
}
