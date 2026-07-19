import { redirect } from "next/navigation";
import { LivingSky } from "../../../components/living-sky";
import { Logo } from "../../../components/Logo";
import { DayCount } from "../../../components/day-count";
import { ConciergeCard } from "../../../components/concierge-card";
import { FrostedCard } from "../../../components/ui/frosted-card";
import { buttonVariants } from "../../../components/ui/button";
import { getSession } from "../../../lib/session";
import { getRepository } from "../../../lib/data";
import { cn } from "../../../lib/utils";
import { SHOP_ITEMS } from "../../../content/shop";

// Shop (v2 #6). Session-guarded. A calm, curated set of accessories — the
// waterproof protector the guarantee recommends comes first. Lead-gen only:
// each item links out to the dealer/store, and the dealer coupon (from
// dealer_locations) applies at their checkout. No cart, no Stripe.
export default async function ShopPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) redirect("/");

  const journey = await repo.getJourney(guarantee.id);
  const day = journey?.currentDay ?? 0;
  const dealer = await repo.getDealerLocationForGuarantee(guarantee.id);

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <DayCount day={day} />
        </div>

        <div className="mt-8 space-y-6">
          <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            A few things for better sleep
          </h1>

          <ConciergeCard>
            A small, hand-picked set to help your new mattress feel like home. A
            waterproof protector is the one I&apos;d start with — it keeps your
            guarantee intact.
          </ConciergeCard>

          {dealer?.couponCode && (
            <FrostedCard className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
                  Your dealer coupon
                </p>
                <p className="text-[14px] leading-relaxed text-mist">
                  {dealer.couponPct
                    ? `${dealer.couponPct}% off at checkout`
                    : "Applied at checkout"}
                </p>
              </div>
              <span className="rounded-full border border-[var(--line)] bg-white/[0.03] px-4 py-2 font-mono text-[13px] tracking-[0.08em] text-dawn">
                {dealer.couponCode}
              </span>
            </FrostedCard>
          )}

          <div className="space-y-4">
            {SHOP_ITEMS.map((item) => (
              <FrostedCard key={item.id} className="space-y-3">
                <div className="space-y-1.5">
                  <h2 className="font-serif text-[19px] leading-tight text-cloud">
                    {item.name}
                  </h2>
                  <p className="text-[15px] leading-relaxed text-mist">
                    {item.blurb}
                  </p>
                </div>
                <p className="text-[13px] leading-relaxed text-mist/80">
                  {item.note}
                </p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "ghost", size: "md" }))}
                >
                  View at the store
                </a>
              </FrostedCard>
            ))}
          </div>

          <p className="text-[13px] leading-relaxed text-mist">
            These links open your dealer&apos;s store in a new tab. Purchases are
            made there, not in the app.
          </p>
        </div>
      </main>
    </>
  );
}
