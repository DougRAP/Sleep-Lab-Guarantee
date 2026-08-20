import Link from "next/link";
import { LivingSky } from "../../../components/living-sky";
import { AppHeader } from "../../../components/app-header";
import { DayCount } from "../../../components/day-count";
import { ConciergeCard } from "../../../components/concierge-card";
import { FrostedCard } from "../../../components/ui/frosted-card";
import { StatusChip } from "../../../components/ui/status-chip";
import { buttonVariants } from "../../../components/ui/button";
import { AddClaimForm } from "../../../components/auth/add-claim-form";
import { requireSignedInAllowUnlinked } from "../../../lib/auth/app-session";
import { getRepository } from "../../../lib/data";
import { byMostRecent } from "../../../lib/data/repository";
import { effectiveReferenceDate } from "../../../lib/demo-server";
import { evaluateEligibility } from "../../../lib/eligibility";
import { draftHasContent } from "../../../lib/fitting";
import { formatPlainDate } from "../../../lib/dates";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../../../content/support";
import { cn } from "../../../lib/utils";
import type { Claim } from "../../../lib/types";

// Requests (v2 #3; v3 M-S5). The customer's own exchange requests — and since
// M-S5 the signed-in HOME for an account with nothing linked: an account
// exists to track requests, so this page works with zero guarantees. Claims
// arrive two ways and are merged: through the linked guarantee, and directly
// via claims.consumer_id (a CG number added to the account).
//
// The claim number (CG…) is the identity here for v3 requests; the retired
// tracking number only ever shows on legacy rows that still carry one.
export default async function RequestsPage() {
  const { session, guarantee, viewer } = await requireSignedInAllowUnlinked();
  const repo = getRepository();

  const [byGuarantee, byUser] = await Promise.all([
    guarantee ? repo.listClaimsForGuarantee(guarantee.id) : Promise.resolve([]),
    viewer ? repo.listClaimsForUser(viewer.userId) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const claims = [...byGuarantee, ...byUser]
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .sort(byMostRecent);

  // Safety net to the lazy-draft rule (Emmy's ghost fix): any pre-existing
  // draft with zero real progress is not worth a "Not yet submitted" row.
  const rows = (
    await Promise.all(
      claims.map(async (claim) => {
        const [items, photos] = await Promise.all([
          repo.listClaimItems(claim.id),
          claim.status === "draft"
            ? repo.listClaimPhotos(claim.id)
            : Promise.resolve([]),
        ]);
        return {
          claim,
          itemCount: items.length,
          visible: draftHasContent(claim, items, photos),
        };
      })
    )
  ).filter((row) => row.visible);

  const email = session?.email ?? viewer?.email ?? null;

  // --- Guarantee-linked extras (day count + the start-a-request gate) ---
  let day = 0;
  let cta: { eligible: boolean; phase: string; windowOpensDay: number } | null = null;
  if (guarantee) {
    const referenceDate = await effectiveReferenceDate(guarantee.deliveryDate);
    const journey = await repo.getJourney(guarantee.id, referenceDate);
    day = journey?.currentDay ?? 0;
    const resolved = await repo.hasResolvedExchange(guarantee.id);
    const elig = evaluateEligibility({
      deliveryDate: guarantee.deliveryDate,
      referenceDate,
      exchangeResolved: resolved,
    });
    cta = {
      eligible: elig.eligible,
      phase: elig.phase,
      windowOpensDay: elig.windowOpensDay,
    };
  }

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={email} />

        {rows.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center gap-6 py-10">
            {guarantee && <DayCount day={day} className="block" />}
            <h1 className="!mt-2 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
              Requests
            </h1>

            <ConciergeCard>
              {guarantee
                ? "You have no requests yet. When you start a comfort exchange, you'll track it here — every step, in plain language."
                : "Nothing here yet. If you've already sent us an exchange request, add its claim number below and it will show up right here."}
            </ConciergeCard>

            {cta && (
              <StartRequestCta
                eligible={cta.eligible}
                phase={cta.phase}
                windowOpensDay={cta.windowOpensDay}
              />
            )}

            <AddClaimBlock />
            {!guarantee && <UnlinkedHelp />}

            {guarantee && (
              <Link
                href="/guarantee"
                className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
              >
                View your guarantee
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {guarantee && <DayCount day={day} className="block" />}
            <h1 className="!mt-2 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
              Requests
            </h1>

            {cta && (
              <StartRequestCta
                eligible={cta.eligible}
                phase={cta.phase}
                windowOpensDay={cta.windowOpensDay}
              />
            )}

            <div className="space-y-3">
              {rows.map(({ claim, itemCount }) => (
                <RequestRow key={claim.id} claim={claim} itemCount={itemCount} />
              ))}
            </div>

            <AddClaimBlock />
            {!guarantee && <UnlinkedHelp />}
          </div>
        )}
      </main>
    </>
  );
}

/**
 * Adding a claim by its CG number, for EVERY account (R-4).
 *
 * This used to live inside UnlinkedHelp, so an account with a purchase linked
 * could not reach it at all: that customer landed on /guarantee, came here, was
 * told "You have no requests yet", and was offered a button to start a second
 * one. The app was inviting a duplicate claim onto an agent's desk, and /link
 * bounces a linked account straight home, so there was no other way in.
 *
 * R-4 attaches a request automatically only when the customer signs in with the
 * address they gave at intake. Every other case lands here, which makes this the
 * recovery path for the whole feature rather than a corner of the unlinked
 * screen. On the happy path it reads as "add another", which is also true.
 */
function AddClaimBlock() {
  return (
    <div className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
        Have a claim number? Add it here
      </h2>
      <AddClaimForm />
    </div>
  );
}

/**
 * The unlinked account's helpers (v3 M-S5): link a purchase, or reach a person.
 * Never a dead-end. The claim-number form moved out to AddClaimBlock.
 */
function UnlinkedHelp() {
  return (
    <div className="space-y-6">
      <p className="text-[13px] leading-relaxed text-mist">
        Bought a mattress and want your 90 nights here too?{" "}
        <Link
          href="/link"
          className="text-dawn underline-offset-4 transition-colors hover:underline"
        >
          Link your purchase
        </Link>
        .
      </p>
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
    </div>
  );
}

/**
 * The way INTO a new request, right where people look for it (review
 * 2026-07-22). Same rule as the /guarantee button: live only in the 31–90
 * window; outside it, a calm disabled affordance says when it opens.
 * /fitting resumes an open draft on its own, so this is always safe to tap.
 */
function StartRequestCta({
  eligible,
  phase,
  windowOpensDay,
}: {
  eligible: boolean;
  phase: string;
  windowOpensDay: number;
}) {
  if (eligible) {
    return (
      <Link
        href="/fitting"
        className={cn(buttonVariants({ variant: "primary", size: "lg" }))}
      >
        Start a new request
      </Link>
    );
  }
  const label =
    phase === "resolved"
      ? "Exchange already used"
      : phase === "expired"
        ? "Window closed on day 90"
        : `Opens on day ${windowOpensDay}`;
  return (
    <div
      aria-disabled="true"
      className={cn(
        buttonVariants({ variant: "primary", size: "lg" }),
        "cursor-not-allowed opacity-45"
      )}
    >
      {label}
    </div>
  );
}

/**
 * One request. Consumer-facing: no customer name, no sales order. v3 requests
 * lead with the CG claim number; only a legacy row still shows its tracking
 * number. A draft has neither and links back into the fitting to be finished.
 */
function RequestRow({ claim, itemCount }: { claim: Claim; itemCount: number }) {
  const isDraft = claim.status === "draft";
  const reference = claim.claimNumber ?? claim.trackingNumber;

  return (
    <FrostedCard className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
            {claim.claimNumber ? "Claim number" : "Tracking"}
          </p>
          <p className="break-words font-mono text-[15px] text-cloud">
            {reference ?? "Not yet submitted"}
          </p>
        </div>
        <StatusChip status={claim.status} />
      </div>

      <p className="text-[13px] leading-relaxed text-mist">
        {claim.submittedAt
          ? `Sent ${formatPlainDate(claim.submittedAt)}`
          : "Not sent yet"}
        {" · "}
        {itemCount === 0
          ? claim.modelNumber?.trim()
            ? claim.modelNumber
            : "No mattress added yet"
          : `${itemCount} ${itemCount === 1 ? "mattress" : "mattresses"}`}
      </p>

      <Link
        href={isDraft ? "/fitting" : `/requests/${claim.id}`}
        className={cn(buttonVariants({ variant: "ghost", size: "md" }))}
      >
        {isDraft ? "Pick up where you left off" : "See the details"}
      </Link>
    </FrostedCard>
  );
}
