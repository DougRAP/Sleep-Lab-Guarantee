import Link from "next/link";
import { LivingSky } from "../../../components/living-sky";
import { AppHeader } from "../../../components/app-header";
import { DayCount } from "../../../components/day-count";
import { ConciergeCard } from "../../../components/concierge-card";
import { buttonVariants } from "../../../components/ui/button";
import { requireSignedInAllowUnlinked } from "../../../lib/auth/app-session";
import { getRepository } from "../../../lib/data";
import { effectiveReferenceDate } from "../../../lib/demo-server";
import { evaluateEligibility } from "../../../lib/eligibility";
import { cn } from "../../../lib/utils";
import { GUARANTEE_ESSENTIALS, GUARANTEE_META } from "../../../content/guarantee-terms";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../../../content/support";

// The Guarantee view (v2 #1). Session-guarded. Shows the customer's eligibility
// state (from the eligibility engine + the session's guarantee), a Request-
// exchange affordance (enabled only in the day 31–90 window; the fitting itself
// is M5), a short plain-language "essentials" summary, and a link OUT to the full
// externally-hosted guarantee (no in-app signing). Poster-first, printed-light.
export default async function GuaranteePage() {
  // R-6 (Emy, via Doug: "She says the guarantee button doesn't work there").
  // This used to demand a linked purchase and bounce to /requests, so the tab
  // was offered and led nowhere. The terms are the same terms whether or not a
  // purchase is linked; only the day count and the exchange need one.
  const { session, guarantee, viewer } = await requireSignedInAllowUnlinked();
  const email = session?.email ?? viewer?.email ?? null;
  if (!guarantee) return <UnlinkedGuarantee email={email} />;

  const repo = getRepository();
  const resolved = await repo.hasResolvedExchange(guarantee.id);
  // The effective reference date is real "now" unless the demo day-jumper has
  // set a preview day, so /tonight, /guarantee and the fitting gate all agree.
  const elig = evaluateEligibility({
    deliveryDate: guarantee.deliveryDate,
    referenceDate: await effectiveReferenceDate(guarantee.deliveryDate),
    exchangeResolved: resolved,
  });

  const state = eligibilityCopy(elig);

  return (
    <>
      <LivingSky day={elig.day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={email} />

        <div className="mt-8 space-y-6">
          {/* The day count as an eyebrow above the H1 (review 2026-07-22):
              the whole app is about what day you're on, so it leads the page. */}
          <DayCount day={elig.day} className="block" />
          <h1 className="!mt-2 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
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
            Once your purchase is on your account, this page counts your nights
            for you.{" "}
            <Link
              href="/link"
              className="text-dawn underline-offset-4 transition-colors hover:underline"
            >
              Add your purchase
            </Link>
            .
          </p>
          <Link
            href="/guarantee/help"
            className="inline-block font-serif text-[16px] italic text-dawn underline-offset-4 transition-colors hover:underline"
          >
            Something else? (e.g. a damaged mattress)
          </Link>
          <p className="text-[13px] leading-relaxed text-mist">
            Anytime, you can call us at {SUPPORT_PHONE} or email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-dawn underline-offset-4 transition-colors hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </main>
    </>
  );
}

/** Eligibility state → one line of the guide's voice + the affordance label. */
function eligibilityCopy(elig: {
  day: number;
  eligible: boolean;
  phase: string;
  windowOpensDay: number;
  reasons: { ruleId: string; message: string }[];
}): { message: string; affordance: string } {
  const { day, eligible, phase, windowOpensDay } = elig;
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

/**
 * R-6: the same guarantee, without a purchase attached to the account yet.
 *
 * No day count and no exchange affordance, because both need a delivery date
 * this account has not given us. Offering a greyed-out "Request an exchange"
 * under an eligibility message would be inventing a state: there is nothing to
 * exchange, which is different from being outside the window.
 *
 * Everything else on this page needs no purchase: the essentials, the full
 * terms, and the way to reach a person. That last one was NOT true when this
 * branch was first written — "Something else?" pointed at /guarantee/help,
 * which still demanded a linked purchase and bounced, reproducing Emy's own
 * complaint one level down. That page has its own unlinked branch now.
 *
 * NO INTEGRATION COVERAGE, and there cannot be: both Playwright configs blank
 * the Supabase env, so isAuthConfigured() is false and
 * requireSignedInAllowUnlinked delegates to requireGuarantee on the
 * light-verify path, which always resolves a row. This branch is dead code
 * under `npm run test:e2e`. The visibility rule it pairs with is covered in
 * lib/shell.test.ts; the branch itself is checked by hand (test-guide.html).
 */
function UnlinkedGuarantee({ email }: { email: string | null }) {
  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={email} />

        <div className="mt-8 space-y-6">
          <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            Your 90-Night Comfort Guarantee
          </h1>

          <ConciergeCard>
            These are the same 90 nights on every purchase, and they read the
            same whether or not yours is on your account. Once it&apos;s here, I
            can tell you which night you&apos;re on and start an exchange from
            this page.
          </ConciergeCard>
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
        </div>
      </main>
    </>
  );
}
