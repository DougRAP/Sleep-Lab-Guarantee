import { redirect } from "next/navigation";
import { LivingSky } from "../../components/living-sky";
import { Logo } from "../../components/Logo";
import { ClaimFlow } from "../../components/claim/claim-flow";
import { stageForStep } from "../../lib/claim-flow";
import { getClaimSession } from "../../lib/claim-session";
import { getRepository } from "../../lib/data";
import { isAuthConfigured } from "../../lib/auth/config";
import { claimantHasAccount } from "../../lib/auth/link";
import { claimPhotoThumbs, isPhotoStorageConfigured } from "../../lib/storage";

export const dynamic = "force-dynamic";

export const metadata = { title: "Request an exchange · RAP Sleep Lab" };

/**
 * The v3 anonymous exchange request (spec §2) — a focused flow like /fitting:
 * no account, carried by the claimant cookie alone. It DOES carry the bottom
 * bar as of R-1 (Doug, 2026-08-19); for an anonymous claimant that bar is the
 * support affordance, never tabs (lib/shell.ts, footerPlan). No cookie
 * (or a stale one) lands back on the front door, where the entry form starts a
 * fresh request.
 *
 * The stored `step` column doubles as the resume point. Mapping its legacy
 * values onto the v3 stages lives in lib/claim-flow.ts (stageForStep), because
 * R-2 needs the inverse too: stepping back has to persist where the customer
 * went, or Back would silently undo itself on the next reload.
 */
export default async function ClaimPage() {
  const session = await getClaimSession();
  if (!session) redirect("/");

  const repo = getRepository();
  const claim = await repo.getClaimById(session.claimId);
  if (!claim) redirect("/");

  const photos = await repo.listClaimPhotos(claim.id);
  const photoThumbs = await claimPhotoThumbs(photos);
  const submitted = claim.status !== "draft";

  // R-9, and this is the RELOAD path only: coming back to /claim with the
  // claimant cookie still armed. On the live submit the wizard moves to the
  // confirmation screen client-side, so this render already happened while the
  // claim was still a draft — submitAnonymousClaim carries the answer instead.
  // Both call the same gate, so the two paths cannot drift.
  //
  // claimantHasAccount is what makes this cheap: it returns before touching the
  // backend for a draft, and every wizard step is a draft.
  const recognisedAccount = await claimantHasAccount(repo, claim, {
    authConfigured: isAuthConfigured(),
  });

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
      >
        <div>
          <Logo />
        </div>

        <h1 className="mt-8 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
          {submitted ? "Your exchange request" : "Request an exchange"}
        </h1>

        <div className="mt-6">
          <ClaimFlow
            initialStage={stageForStep(claim.step ?? "intake")}
            storageConfigured={isPhotoStorageConfigured()}
            authConfigured={isAuthConfigured()}
            recognisedAccount={recognisedAccount}
            details={{
              modelNumber: claim.modelNumber ?? "",
              purchaseDate: claim.purchaseDate ?? "",
              deliveryDate: claim.deliveryDate ?? "",
              hasSalesOrder: Boolean(claim.salesOrderNumber?.trim()),
              earlyPreference: claim.earlyPreference ?? null,
              reasonExperience: claim.reasonExperience ?? "",
              preferredReplacement: claim.preferredReplacement ?? "",
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
