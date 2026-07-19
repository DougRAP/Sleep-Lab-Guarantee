import { LivingSky } from "../components/living-sky";
import { Logo } from "../components/Logo";
import { DayCount } from "../components/day-count";
import { ConciergeCard } from "../components/concierge-card";
import { CheckIn } from "../components/tonight/check-in";

// M1: static "Tonight" home. Journey day + greeting become live data in M2/M3.
export default function TonightPage() {
  const day = 12;

  return (
    <>
      <LivingSky day={day} />
      <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-10 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <header className="flex items-center justify-between">
          <Logo />
          <DayCount day={day} />
        </header>

        <div className="flex flex-1 flex-col justify-end gap-6">
          <div className="font-mono text-[52px] font-medium leading-none tracking-tight text-cloud">
            {day}
            <span className="text-[20px] text-mist"> / 90 nights</span>
          </div>

          <ConciergeCard>
            You&apos;re twelve nights in. Bodies take about six weeks to settle
            — how did last night feel?
          </ConciergeCard>

          <CheckIn />
        </div>
      </main>
    </>
  );
}
