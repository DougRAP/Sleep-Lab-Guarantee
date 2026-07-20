import Link from "next/link";
import { LivingSky } from "../../../components/living-sky";
import { Logo } from "../../../components/Logo";
import { DayCount } from "../../../components/day-count";
import { ConciergeCard } from "../../../components/concierge-card";
import { FrostedCard } from "../../../components/ui/frosted-card";
import { buttonVariants } from "../../../components/ui/button";
import { requireGuarantee } from "../../../lib/auth/app-session";
import { getRepository } from "../../../lib/data";
import { effectiveReferenceDate } from "../../../lib/demo-server";
import { statusLabel } from "../../../lib/claim-status";
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
  const { guarantee } = await requireGuarantee();
  const repo = getRepository();

  const journey = await repo.getJourney(
    guarantee.id,
    await effectiveReferenceDate(guarantee.deliveryDate)
  );
  const day = journey?.currentDay ?? 0;

  const claims = await repo.listClaimsForGuarantee(guarantee.id);
  const rows = await Promise.all(
    claims.map(async (claim) => ({
      claim,
      itemCount: (await repo.listClaimItems(claim.id)).length,
    }))
  );

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <DayCount day={day} />
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center gap-6 py-10">
            <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
              Requests
            </h1>

            <ConciergeCard>
              You have no requests yet. When you start a comfort exchange,
              you&apos;ll track it here — every step, in plain language.
            </ConciergeCard>

            <Link
              href="/guarantee"
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
            >
              View your guarantee
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
              Requests
            </h1>

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
        <span className="shrink-0 rounded-full border border-[var(--line)] bg-white/[0.03] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-dawn">
          {statusLabel(claim.status)}
        </span>
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
