import { redirect } from "next/navigation";
import Link from "next/link";
import { LivingSky } from "../../../components/living-sky";
import { Logo } from "../../../components/Logo";
import { DayCount } from "../../../components/day-count";
import { ConciergeCard } from "../../../components/concierge-card";
import { buttonVariants } from "../../../components/ui/button";
import { getSession } from "../../../lib/session";
import { getRepository } from "../../../lib/data";
import { evaluateEligibility } from "../../../lib/eligibility";
import { cn } from "../../../lib/utils";
import { GUARANTEE_TERMS, GUARANTEE_META } from "../../../content/guarantee-terms";

// The Guarantee view (v2 #1). Session-guarded. Shows the customer's eligibility
// state (from the eligibility engine + the session's guarantee), a Request-
// exchange affordance (enabled only in the day 31–90 window; the fitting itself
// is M5), the 90-Night terms, and a quiet path to dealer triage for non-comfort
// issues. Poster-first, printed-light — no claims-form treatment.
export default async function GuaranteePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) redirect("/");

  const resolved = await repo.hasResolvedExchange(guarantee.id);
  const elig = evaluateEligibility({
    deliveryDate: guarantee.deliveryDate,
    exchangeResolved: resolved,
  });

  const state = eligibilityCopy(elig.day, elig.eligible, elig.phase, elig.windowOpensDay);

  return (
    <>
      <LivingSky day={elig.day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <DayCount day={elig.day} />
        </div>

        <div className="mt-8 space-y-6">
          <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            Your 90-Night Comfort Guarantee
          </h1>

          <ConciergeCard>{state.message}</ConciergeCard>

          {elig.eligible ? (
            <Link
              href="/fitting"
              className={cn(buttonVariants({ variant: "primary", size: "lg" }))}
            >
              Request an exchange
            </Link>
          ) : (
            <div
              aria-disabled="true"
              className={cn(
                buttonVariants({ variant: "primary", size: "lg" }),
                "cursor-not-allowed opacity-45"
              )}
            >
              {state.affordance}
            </div>
          )}
        </div>

        <div className="mt-10 divide-y divide-[var(--line)]">
          {GUARANTEE_TERMS.map((section) => (
            <section key={section.id} className="space-y-2.5 py-6 first:pt-0">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
                {section.heading}
              </h2>
              {section.body?.map((p, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-cloud/90">
                  {p}
                </p>
              ))}
              {section.items && (
                <ul className="space-y-1.5 pt-0.5">
                  {section.items.map((item, i) => (
                    <li
                      key={i}
                      className="flex gap-2.5 text-[15px] leading-relaxed text-cloud/90"
                    >
                      <span aria-hidden className="mt-[2px] text-dawn">
                        &middot;
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-8 space-y-4 border-t border-[var(--line)] pt-6">
          <p className="text-[13px] leading-relaxed text-mist">
            This is a plain-language summary of the {GUARANTEE_META.name}. The
            signed agreement governs.
          </p>
          <Link
            href="/guarantee/help"
            className="inline-block font-serif text-[16px] italic text-dawn underline-offset-4 transition-colors hover:underline"
          >
            Something else? (e.g. a damaged mattress)
          </Link>
        </div>
      </main>
    </>
  );
}

/** Eligibility state → one line of the guide's voice + the affordance label. */
function eligibilityCopy(
  day: number,
  eligible: boolean,
  phase: string,
  windowOpensDay: number
): { message: string; affordance: string } {
  if (phase === "resolved") {
    return {
      message:
        "Your comfort exchange is already set — the one-time guarantee has been used. Rest easy; I'm still here whenever you need me.",
      affordance: "Exchange already used",
    };
  }
  if (eligible) {
    return {
      message: `You're eligible — day ${day} of 90. When it still isn't right, we can walk through a comfort exchange together, one step at a time.`,
      affordance: "Request an exchange",
    };
  }
  if (phase === "expired") {
    return {
      message: `You're on day ${day}. The 90-night comfort window has closed, but I'm still here for anything else you need.`,
      affordance: "Window closed on day 90",
    };
  }
  // settle_in
  return {
    message: `You're on day ${day}. Your exchange window opens on day ${windowOpensDay} — give the mattress a few weeks to settle in, and I'll keep checking in with you.`,
    affordance: `Opens on day ${windowOpensDay}`,
  };
}
