import Link from "next/link";
import { LivingSky } from "../components/living-sky";
import { Logo } from "../components/Logo";
import { Entry } from "../components/welcome/entry";
import { AccountForm } from "../components/auth/account-form";
import { isAuthConfigured } from "../lib/auth/config";

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

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-10 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
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
