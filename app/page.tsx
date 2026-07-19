import { LivingSky } from "../components/living-sky";
import { Logo } from "../components/Logo";
import { Entry } from "../components/welcome/entry";

// The front door. Path A: pre-identified via ?token= from the retailer dashboard.
// Path B: self-serve "find your purchase". Verify/lookup wired to Supabase in M2.
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const hasToken = Boolean(token);

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
              Welcome back — let&apos;s confirm it&apos;s you.
            </p>
          )}

          <Entry hasToken={hasToken} />

          {!hasToken && (
            <p className="text-[13px] text-mist">
              Came from your retailer&apos;s dashboard? Your link signs you in
              automatically.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
