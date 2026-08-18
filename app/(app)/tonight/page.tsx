import Link from "next/link";
import { LivingSky } from "../../../components/living-sky";
import { AppHeader } from "../../../components/app-header";
import { ConciergeCard } from "../../../components/concierge-card";
import { CheckIn } from "../../../components/tonight/check-in";
import { InitialImpression } from "../../../components/tonight/initial-impression";
import { buttonVariants } from "../../../components/ui/button";
import { requireGuarantee } from "../../../lib/auth/app-session";
import { getRepository } from "../../../lib/data";
import { effectiveReferenceDate } from "../../../lib/demo-server";
import { timeOfDayFor } from "../../../lib/tips";
import { cn } from "../../../lib/utils";
import type { Guarantee, JourneyPhase } from "../../../lib/types";

// Live "Tonight" home. Reads the verified guarantee from the signed session and
// computes the journey day + phase via the eligibility engine (M2). M3 adds a
// persisted check-in, tonight's tip, and a quiet path to the concierge — the
// poster design is unchanged.
export default async function TonightPage() {
  const { session, guarantee } = await requireGuarantee();
  const repo = getRepository();

  // Real "now" unless the demo day-jumper has set a preview day.
  const journey = await repo.getJourney(
    guarantee.id,
    await effectiveReferenceDate(guarantee.deliveryDate)
  );
  const day = journey?.currentDay ?? 0;
  const phase = journey?.phase ?? "settle_in";

  const [todayCheckIn, impression, tip] = await Promise.all([
    repo.getTodayCheckIn(guarantee.id),
    repo.getInitialImpression(guarantee.id),
    repo.getTip({ day, phase, timeOfDay: timeOfDayFor() }),
  ]);

  // Help from night one: on the very first day or two, capture the out-of-the-box
  // first impression before any nightly check-in. Once recorded (or from day 2),
  // fall through to the existing nightly check-in.
  const needsImpression = !impression && day <= 1;

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={session.email} />

        {/* Review 2026-07-22: content flows from the top — the old bottom-anchored
            poster left "way too much padding above" on tall phones. */}
        <div className="flex flex-col gap-6 pt-8">
          <div className="font-mono text-[52px] font-medium leading-none tracking-tight text-cloud">
            {day}
            <span className="text-[20px] text-mist"> / 90 nights</span>
          </div>

          <ConciergeCard>{conciergeLine(day, phase, guarantee, needsImpression)}</ConciergeCard>

          {needsImpression ? (
            <InitialImpression />
          ) : (
            <CheckIn initialFeeling={todayCheckIn?.feeling ?? null} />
          )}

          {tip && (
            <div className="space-y-1.5">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
                Tonight&apos;s note
              </p>
              <p className="text-[15px] leading-relaxed text-mist">{tip.body}</p>
            </div>
          )}

          <Link
            href="/concierge"
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
          >
            Talk to your guide
          </Link>
        </div>
      </main>
    </>
  );
}

/** One quiet line from the guide, tied to journey-day + phase (PRD §2a). */
function conciergeLine(
  day: number,
  phase: JourneyPhase,
  guarantee: Guarantee,
  needsImpression = false
): string {
  const nights = `${day} ${day === 1 ? "night" : "nights"} in`;
  const first = guarantee.customerFirstName?.trim();
  const hello = first ? `${first}, ` : "";

  // Day 0–1, first impression not yet shared: greet the arrival, don't ask about
  // "last night" before they've slept on it.
  if (needsImpression) {
    return day <= 0
      ? `${hello}your mattress has arrived. Tonight is the first night — let's start with how it feels out of the box.`
      : `${hello}you're settling in. Before we track your nights, tell me how it felt out of the box.`;
  }

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
