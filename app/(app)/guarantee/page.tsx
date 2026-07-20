import Link from "next/link";
import { LivingSky } from "../../../components/living-sky";
import { Logo } from "../../../components/Logo";
import { DayCount } from "../../../components/day-count";
import { ConciergeCard } from "../../../components/concierge-card";
import { buttonVariants } from "../../../components/ui/button";
import { SignOut } from "../../../components/auth/sign-out";
import { requireGuarantee } from "../../../lib/auth/app-session";
import { getRepository } from "../../../lib/data";
import { effectiveReferenceDate } from "../../../lib/demo-server";
import { evaluateEligibility } from "../../../lib/eligibility";
import { cn } from "../../../lib/utils";
import { GUARANTEE_ESSENTIALS, GUARANTEE_META } from "../../../content/guarantee-terms";

// The Guarantee view (v2 #1). Session-guarded. Shows the customer's eligibility
// state (from the eligibility engine + the session's guarantee), a Request-
// exchange affordance (enabled only in the day 31–90 window; the fitting itself
// is M5), a short plain-language "essentials" summary, and a link OUT to the full
// externally-hosted guarantee (no in-app signing). Poster-first, printed-light.
export default async function GuaranteePage() {
  const { guarantee } = await requireGuarantee();
  const repo = getRepository();

  const resolved = await repo.hasResolvedExchange(guarantee.id);
  // The effective reference date is real "now" unless the demo day-jumper has
  // set a preview day, so /tonight, /guarantee and the fitting gate all agree.
  const elig = evaluateEligibility({
    deliveryDate: guarantee.deliveryDate,
    referenceDate: await effectiveReferenceDate(guarantee.deliveryDate),
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

        <div className="mt-10 space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            The essentials
          </h2>
          <ul className="space-y-2">
            {GUARANTEE_ESSENTIALS.map((item, i) => (
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
          <a
            href={GUARANTEE_META.fullTermsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "mt-3")}
          >
            Read the full 90-Night Guarantee
          </a>
        </div>

        <div className="mt-8 space-y-4 border-t border-[var(--line)] pt-6">
          <p className="text-[13px] leading-relaxed text-mist">
            The essentials above are a summary; the full {GUARANTEE_META.name}{" "}
            is linked above.
          </p>
          <Link
            href="/guarantee/help"
            className="inline-block font-serif text-[16px] italic text-dawn underline-offset-4 transition-colors hover:underline"
          >
            Something else? (e.g. a damaged mattress)
          </Link>

          {/* The one quiet way out of the account. Same whisper as the back
              links elsewhere — never a peer of the primary action. */}
          <div className="pt-2">
            <SignOut />
          </div>
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
