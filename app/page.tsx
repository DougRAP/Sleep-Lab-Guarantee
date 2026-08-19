import Link from "next/link";
import { LivingSky } from "../components/living-sky";
import { Logo } from "../components/Logo";
import { Entry } from "../components/welcome/entry";
import { AccountForm } from "../components/auth/account-form";
import { ClaimEntryForm } from "../components/claim/entry-form";
import { isAuthConfigured } from "../lib/auth/config";
import { isClaimsMode } from "../lib/demo";
import { getClaimSession } from "../lib/claim-session";
import { getRepository } from "../lib/data";
import { GUARANTEE_META } from "../content/guarantee-terms";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../content/support";

/**
 * The front door. Two worlds, one poster:
 *
 *  - Supabase configured (real auth): the first thing a customer does is CREATE
 *    AN ACCOUNT. Arriving on a dashboard link (`?token=…`) does not skip this —
 *    the middleware parks the token and it links the purchase automatically the
 *    moment the account exists. Returning customers log in.
 *
 *  - Supabase absent (production today): falls back to the original light-verify
 *    entry — sales order + last name — so the app and the demo keep working
 *    before the keys land.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const hasToken = Boolean(token);
  const realAuth = isAuthConfigured();

  // v3 (spec §2.1–§2.2): in claims mode the front door IS the claim — welcome,
  // the full-terms link, and the identify+contact form on one page. The old
  // light-verify Entry / account-first doors are replaced here only; their
  // components stay for the non-claims world (M-S3 decides their fate).
  if (isClaimsMode()) return <ClaimLanding realAuth={realAuth} />;

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
      >
        <div>
          <Logo />
        </div>

        <div className="flex flex-1 flex-col justify-center gap-6 py-8">
          <div className="space-y-3">
            <h1 className="font-serif text-[30px] leading-[1.15] tracking-[-0.01em] text-cloud">
              Welcome. Let&apos;s help your new mattress feel like home.
            </h1>
            <p className="text-[15px] leading-relaxed text-mist">
              Your purchase includes a 90-Night Comfort Guarantee. This is your
              companion for settling in — a little guidance each night, and a
              simple way to make it right if it never feels like the one.
            </p>
          </div>

          {hasToken && (
            <p className="font-serif text-[17px] italic text-dawn">
              {realAuth
                ? "We have your purchase — let's make it yours."
                : "Welcome back — let's confirm it's you."}
            </p>
          )}

          {realAuth ? (
            hasToken ? (
              /* A dashboard link means a brand-new customer whose purchase
                 auto-links on account creation — signup stays first here. */
              <>
                <AccountForm mode="signup" />
                <p className="text-[13px] text-mist">
                  Already have an account?{" "}
                  <Link
                    href="/login"
                    className="text-dawn underline-offset-4 transition-colors hover:underline"
                  >
                    Log in
                  </Link>
                </p>
              </>
            ) : (
              /* Emmy's QA (2026-07-23): most visits are returning customers,
                 so the front door leads with Log In; Create Account sits
                 underneath. */
              <>
                <AccountForm mode="login" />
                <p className="text-[13px] text-mist">
                  New here?{" "}
                  <Link
                    href="/signup"
                    className="text-dawn underline-offset-4 transition-colors hover:underline"
                  >
                    Create your account
                  </Link>
                </p>
              </>
            )
          ) : (
            <>
              <Entry token={token} />
              {!hasToken && (
                <p className="text-[13px] text-mist">
                  Came from your retailer&apos;s dashboard? Your link signs you in
                  automatically.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * The v3 claim-first front door (spec §2.1). Anonymous: no account gate, no
 * companion language. An open draft (the claimant cookie) offers a resume
 * link above the fresh form.
 */
async function ClaimLanding({ realAuth }: { realAuth: boolean }) {
  // "Continue where you left off" only when the cookie still names a live,
  // unsubmitted draft — a stale or submitted one just gets the fresh form.
  const session = await getClaimSession();
  const draft = session
    ? await getRepository().getClaimById(session.claimId)
    : null;
  const hasDraft = Boolean(draft && draft.status === "draft");

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
      >
        <div>
          <Logo />
        </div>

        <div className="flex flex-1 flex-col justify-center gap-6 py-8">
          <div className="space-y-3">
            <h1 className="font-serif text-[30px] leading-[1.15] tracking-[-0.01em] text-cloud">
              Your 90-Night Comfort Guarantee starts here.
            </h1>
            <p className="text-[15px] leading-relaxed text-mist">
              Your purchase includes a 90-Night Comfort Guarantee. Requesting an
              exchange, asking advice, or getting other helpful information all
              start below. And at any time, you can call us at {SUPPORT_PHONE}{" "}
              or email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-dawn underline-offset-4 transition-colors hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
            <p className="text-[13px]">
              <a
                href={GUARANTEE_META.fullTermsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-dawn underline-offset-4 transition-colors hover:underline"
              >
                View the full 90-Night Comfort Guarantee &rsaquo;
              </a>
            </p>
          </div>

          {hasDraft && (
            <p className="font-serif text-[17px] italic text-dawn">
              You have a request in progress.{" "}
              <Link href="/claim" className="underline-offset-4 hover:underline">
                Continue where you left off
              </Link>
              , or start fresh below.
            </p>
          )}

          <ClaimEntryForm />

          {realAuth && (
            <p className="text-[13px] text-mist">
              Track an existing request?{" "}
              <Link
                href="/login"
                className="text-dawn underline-offset-4 transition-colors hover:underline"
              >
                Log in
              </Link>
            </p>
          )}
        </div>
      </main>
    </>
  );
}
