import { LivingSky } from "../../../components/living-sky";
import { AppHeader } from "../../../components/app-header";
import { DayCount } from "../../../components/day-count";
import { ConciergeCard } from "../../../components/concierge-card";
import { FrostedCard } from "../../../components/ui/frosted-card";
import { buttonVariants } from "../../../components/ui/button";
import { GetCouponButton } from "../../../components/shop/get-coupon-button";
import { requireGuarantee } from "../../../lib/auth/app-session";
import { getRepository } from "../../../lib/data";
import { formatDayMonth } from "../../../lib/dates";
import { cn } from "../../../lib/utils";
import { SHOP_ITEMS } from "../../../content/shop";
import type { Coupon, DealerLocation } from "../../../lib/types";

/** The dealer's terms travel with the code, wherever it is shown. */
const COUPON_TERMS = "Subject to dealer conditions and rules of acceptance.";

// Shop (v2 #6). Session-guarded. A calm, curated set of accessories — the
// waterproof protector the guarantee recommends comes first. Lead-gen only:
// each item links out to the dealer/store, and the dealer coupon (from
// dealer_locations) applies at their checkout. No cart, no Stripe.
export default async function ShopPage() {
  const { session, guarantee } = await requireGuarantee();
  const repo = getRepository();

  const journey = await repo.getJourney(guarantee.id);
  const day = journey?.currentDay ?? 0;
  const dealer = await repo.getDealerLocationForGuarantee(guarantee.id);
  // Issued on request, never always-on (PRD #6) — so the card either offers one
  // or shows the code the customer already holds.
  const coupon = await repo.getActiveCoupon(guarantee.id);

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={session.email} />

        <div className="mt-8 space-y-6">
          <DayCount day={day} className="block" />
          <h1 className="!mt-2 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            A few things for better sleep
          </h1>

          <ConciergeCard>
            A small, hand-picked set to help your new mattress feel like home. A
            waterproof protector is the one I&apos;d start with — it keeps your
            guarantee intact.
          </ConciergeCard>

          {coupon ? (
            <ActiveCoupon coupon={coupon} />
          ) : (
            dealer?.couponCode && <CouponOffer dealer={dealer} />
          )}

          <div className="space-y-4">
            {SHOP_ITEMS.map((item) => (
              <FrostedCard key={item.id} className="space-y-3">
                {item.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    className="h-40 w-full rounded-xl border border-[var(--line)] object-cover"
                  />
                )}
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

/** No code yet — explain the offer and let the customer ask for one. */
function CouponOffer({ dealer }: { dealer: DealerLocation }) {
  return (
    <FrostedCard className="space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
          Your dealer coupon
        </p>
        <p className="text-[15px] leading-relaxed text-mist">
          {dealer.couponPct
            ? `${dealer.couponPct}% off at ${dealer.name}, on a code that's yours alone. It's good for four weeks once you ask for it.`
            : `A discount at ${dealer.name}, on a code that's yours alone. It's good for four weeks once you ask for it.`}
        </p>
      </div>

      <GetCouponButton />

      <p className="text-[13px] leading-relaxed text-mist/80">{COUPON_TERMS}</p>
    </FrostedCard>
  );
}

/** The code they already hold. Same quiet treatment it has always had. */
function ActiveCoupon({ coupon }: { coupon: Coupon }) {
  return (
    <FrostedCard className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            Your coupon
          </p>
          <p className="text-[14px] leading-relaxed text-mist">
            {coupon.pct
              ? `${coupon.pct}% off at checkout`
              : "Applied at checkout"}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line)] bg-white/[0.03] px-4 py-2 font-mono text-[13px] tracking-[0.08em] text-dawn">
          {coupon.code}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-mist">
        Good through {formatDayMonth(coupon.expiresAt)}.
      </p>

      <p className="text-[13px] leading-relaxed text-mist/80">{COUPON_TERMS}</p>
    </FrostedCard>
  );
}
