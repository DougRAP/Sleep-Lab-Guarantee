import Link from "next/link";
import { LivingSky } from "../../../components/living-sky";
import { AppHeader } from "../../../components/app-header";
import { DayCount } from "../../../components/day-count";
import { ConciergeChat } from "../../../components/concierge/concierge-chat";
import { requireGuarantee } from "../../../lib/auth/app-session";
import { getRepository } from "../../../lib/data";
import { effectiveReferenceDate } from "../../../lib/demo-server";
import { conciergeGreeting } from "../../../lib/concierge";

// The AI sleep concierge. Session-guarded like /tonight (redirect to / if no
// session). The conversation is server-authoritative: threads/messages persist
// via the repository, and the guide's replies come from the concierge action
// (Anthropic when a key is set, scripted fallback otherwise).
export default async function ConciergePage() {
  const { session, guarantee } = await requireGuarantee();
  const repo = getRepository();

  const journey = await repo.getJourney(
    guarantee.id,
    await effectiveReferenceDate(guarantee.deliveryDate)
  );
  const day = journey?.currentDay ?? 0;
  const phase = journey?.phase ?? "settle_in";

  const thread = await repo.getOrCreateConciergeThread(guarantee.id);
  const stored = await repo.listConciergeMessages(thread.id);

  const greeting = conciergeGreeting({
    firstName: guarantee.customerFirstName?.trim() || null,
    day,
    phase,
  });

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={session.email} />

        <div className="mt-3 flex items-center justify-between">
          <Link
            href="/tonight"
            className="inline-block font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
          >
            &lsaquo; Tonight
          </Link>
          <DayCount day={day} />
        </div>

        <ConciergeChat
          greeting={greeting}
          initial={stored.map((m) => ({ role: m.role, body: m.body }))}
        />
      </main>
    </>
  );
}
