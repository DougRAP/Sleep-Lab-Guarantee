import { redirect } from "next/navigation";
import { LivingSky } from "../../components/living-sky";
import { Logo } from "../../components/Logo";
import { DayCount } from "../../components/day-count";
import { ConciergeCard } from "../../components/concierge-card";
import { CheckIn } from "../../components/tonight/check-in";
import { getSession } from "../../lib/session";
import { getRepository } from "../../lib/data";
import type { Guarantee, JourneyPhase } from "../../lib/types";

// Live "Tonight" home. Reads the verified guarantee from the signed session and
// computes the journey day + phase via the eligibility engine (M2). Design is
// unchanged from M1 — only the data is now live.
export default async function TonightPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) redirect("/");

  const journey = await repo.getJourney(guarantee.id);
  const day = journey?.currentDay ?? 0;
  const phase = journey?.phase ?? "settle_in";

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-10 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <DayCount day={day} />
        </div>

        <div className="flex flex-1 flex-col justify-end gap-6">
          <div className="font-mono text-[52px] font-medium leading-none tracking-tight text-cloud">
            {day}
            <span className="text-[20px] text-mist"> / 90 nights</span>
          </div>

          <ConciergeCard>{conciergeLine(day, phase, guarantee)}</ConciergeCard>

          <CheckIn />
        </div>
      </main>
    </>
  );
}

/** One quiet line from the guide, tied to journey-day + phase (PRD §2a). */
function conciergeLine(day: number, phase: JourneyPhase, guarantee: Guarantee): string {
  const nights = `${day} ${day === 1 ? "night" : "nights"} in`;
  const first = guarantee.customerFirstName?.trim();
  const hello = first ? `${first}, ` : "";

  switch (phase) {
    case "safety_net":
      return `${hello}you're ${nights}. You're past the settling-in window — if it still isn't right, we can look at a comfort exchange together. How did last night feel?`;
    case "expired":
      return `${hello}you're ${nights}. The 90-night window has closed, but I'm still here whenever you need me.`;
    case "resolved":
      return `${hello}your exchange is set. Rest easy tonight — I'll keep things simple.`;
    case "settle_in":
    default:
      return `${hello}you're ${nights}. Bodies take about six weeks to settle — how did last night feel?`;
  }
}
