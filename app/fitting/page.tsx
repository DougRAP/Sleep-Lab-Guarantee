import { redirect } from "next/navigation";
import Link from "next/link";
import { LivingSky } from "../../components/living-sky";
import { Logo } from "../../components/Logo";
import { ConciergeCard } from "../../components/concierge-card";
import { getSession } from "../../lib/session";
import { getRepository } from "../../lib/data";

// The fitting (exchange request) — placeholder stub for M4. The guided,
// scripted capture flow lands in M5 and replaces this page. Lives OUTSIDE the
// (app) route group on purpose: focused flows stay full-bleed, one-breath
// screens with no bottom nav (DESIGN.md). Session-guarded.
export default async function FittingPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) redirect("/");

  const journey = await repo.getJourney(guarantee.id);
  const day = journey?.currentDay ?? 0;

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-10 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div>
          <Logo />
        </div>

        <div className="flex flex-1 flex-col justify-center gap-6 py-10">
          <ConciergeCard>
            Starting your request — this is available in the next update.
            We&apos;ll walk through it together, one step at a time.
          </ConciergeCard>

          <Link
            href="/guarantee"
            className="inline-block font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
          >
            &lsaquo; Back to your guarantee
          </Link>
        </div>
      </main>
    </>
  );
}
