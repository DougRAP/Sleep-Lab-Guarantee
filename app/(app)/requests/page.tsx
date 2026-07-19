import { redirect } from "next/navigation";
import Link from "next/link";
import { LivingSky } from "../../../components/living-sky";
import { Logo } from "../../../components/Logo";
import { DayCount } from "../../../components/day-count";
import { ConciergeCard } from "../../../components/concierge-card";
import { buttonVariants } from "../../../components/ui/button";
import { getSession } from "../../../lib/session";
import { getRepository } from "../../../lib/data";
import { cn } from "../../../lib/utils";

// Requests (v2 #3). Session-guarded. A calm empty state for M4 — full exchange-
// request tracking arrives with the fitting flow in M5.
export default async function RequestsPage() {
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
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <DayCount day={day} />
        </div>

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
      </main>
    </>
  );
}
