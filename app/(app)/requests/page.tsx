import Link from "next/link";
import { LivingSky } from "../../../components/living-sky";
import { AppHeader } from "../../../components/app-header";
import { DayCount } from "../../../components/day-count";
import { ConciergeCard } from "../../../components/concierge-card";
import { FrostedCard } from "../../../components/ui/frosted-card";
import { StatusChip } from "../../../components/ui/status-chip";
import { buttonVariants } from "../../../components/ui/button";
import { requireGuarantee } from "../../../lib/auth/app-session";
import { getRepository } from "../../../lib/data";
import { effectiveReferenceDate } from "../../../lib/demo-server";
import { evaluateEligibility } from "../../../lib/eligibility";
import { draftHasContent } from "../../../lib/fitting";
import { formatPlainDate } from "../../../lib/dates";
import { cn } from "../../../lib/utils";
import type { Claim } from "../../../lib/types";

// Requests (v2 #3). Session-guarded. The customer's own exchange requests —
// scoped to the session's guarantee, drafts included, because an in-progress
// fitting is a thing they should be able to find their way back to.
//
// The tracking number is the identity here, not the sales order: this is the
// consumer's view, not the dealer's.
export default async function RequestsPage() {
  const { session, guarantee } = await requireGuarantee();
  const repo = getRepository();

  const referenceDate = await effectiveReferenceDate(guarantee.deliveryDate);
  const journey = await repo.getJourney(guarantee.id, referenceDate);
  const day = journey?.currentDay ?? 0;

  // The same gate as /guarantee: a request can start from here too (review
  // 2026-07-22, "the request button should also show on the request page"),
  // inside the day 31–90 window. B-29 (Doug 2026-07-27): a prior submitted
  // request no longer blocks a new one; only a resolved exchange does.
  const resolved = await repo.hasResolvedExchange(guarantee.id);
  const elig = evaluateEligibility({
    deliveryDate: guarantee.deliveryDate,
    referenceDate,
    exchangeResolved: resolved,
  });

  const claims = await repo.listClaimsForGuarantee(guarantee.id);
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

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={session.email} />

        {rows.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center gap-6 py-10">
            <DayCount day={day} className="block" />
            <h1 className="!mt-2 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
              Requests
            </h1>

            <ConciergeCard>
              You have no requests yet. When you start a comfort exchange,
              you&apos;ll track it here — every step, in plain language.
            </ConciergeCard>

            <StartRequestCta eligible={elig.eligible} phase={elig.phase} windowOpensDay={elig.windowOpensDay} />

            <Link
              href="/guarantee"
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
            >
              View your guarantee
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <DayCount day={day} className="block" />
            <h1 className="!mt-2 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
              Requests
            </h1>

            <StartRequestCta eligible={elig.eligible} phase={elig.phase} windowOpensDay={elig.windowOpensDay} />

            <div className="space-y-3">
              {rows.map(({ claim, itemCount }) => (
                <RequestRow key={claim.id} claim={claim} itemCount={itemCount} />
              ))}
            </div>
          </div>
        )}
      </main>
    </>
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
 * One request. Modeled on the admin row, but consumer-facing: no customer name,
 * no sales order — the tracking number is what they were given to follow.
 *
 * A draft has no tracking number and nothing to track, so it links back into the
 * fitting to be finished, never to a detail page.
 */
function RequestRow({ claim, itemCount }: { claim: Claim; itemCount: number }) {
  const isDraft = claim.status === "draft";

  return (
    <FrostedCard className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
            Tracking
          </p>
          <p className="break-words font-mono text-[15px] text-cloud">
            {claim.trackingNumber ?? "Not yet submitted"}
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
          ? "No mattress added yet"
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
