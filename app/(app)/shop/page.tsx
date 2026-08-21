import Link from "next/link";
import { LivingSky } from "../../../components/living-sky";
import { AppHeader } from "../../../components/app-header";
import { DayCount } from "../../../components/day-count";
import { ConciergeCard } from "../../../components/concierge-card";
import { FrostedCard } from "../../../components/ui/frosted-card";
import { buttonVariants } from "../../../components/ui/button";
import { GetCouponButton } from "../../../components/shop/get-coupon-button";
import { requireSignedInAllowUnlinked } from "../../../lib/auth/app-session";
import { getRepository } from "../../../lib/data";
import { formatDayMonth } from "../../../lib/dates";
import { cn } from "../../../lib/utils";
import { SHOP_ITEMS } from "../../../content/shop";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../../../content/support";
import type { Coupon, DealerLocation } from "../../../lib/types";

/** The dealer's terms travel with the code, wherever it is shown. */
const COUPON_TERMS = "Subject to dealer conditions and rules of acceptance.";

// Shop (v2 #6). Session-guarded. A calm, curated set of accessories — the
// waterproof protector the guarantee recommends comes first. Lead-gen only:
// each item links out to the dealer/store, and the dealer coupon (from
// dealer_locations) applies at their checkout. No cart, no Stripe.
export default async function ShopPage() {
  // R-6 (Doug: "Shop, so it hid the shop page. When I refactored it, it should
  // keep the shop page"). This used to demand a linked purchase and bounce, so
  // the tab was offered and led nowhere. The catalogue is a static file and
  // needs no purchase; only the day count and the dealer coupon do.
  //
  // The unlinked branches below have NO integration coverage and cannot: both
  // Playwright configs blank the Supabase env, so the light-verify path always
  // resolves a guarantee. Checked by hand (test-guide.html).
  const { session, guarantee, viewer } = await requireSignedInAllowUnlinked();
  const email = session?.email ?? viewer?.email ?? null;
  const repo = getRepository();

  const journey = guarantee ? await repo.getJourney(guarantee.id) : null;
  const day = journey?.currentDay ?? 0;
  const dealer = guarantee
    ? await repo.getDealerLocationForGuarantee(guarantee.id)
    : null;
  // Issued on request, never always-on (PRD #6) — so the card either offers one
  // or shows the code the customer already holds. It is issued AGAINST a
  // guarantee, so an account with nothing linked is told where it comes from
  // rather than offered one it cannot be given.
  const coupon = guarantee ? await repo.getActiveCoupon(guarantee.id) : null;

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={email} />

        <div className="mt-8 space-y-6">
          {guarantee && <DayCount day={day} className="block" />}
          <h1
            className={cn(
              // !mt-2 tightens the heading under the day-count eyebrow. With no
              // eyebrow it would force 8px onto the first child and leave this
              // page sitting differently from its sibling.
              guarantee && "!mt-2",
              "font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud"
            )}
          >
            A few things for better sleep
          </h1>

          <ConciergeCard>
            A small, hand-picked set to help your new mattress feel like home. A
            waterproof protector is the one I&apos;d start with — it keeps your
            guarantee intact.
          </ConciergeCard>

          {!guarantee ? (
            <p className="text-[13px] leading-relaxed text-mist">
              The dealer coupon is issued against a purchase.{" "}
              <Link
                href="/link"
                className="text-dawn underline-offset-4 transition-colors hover:underline"
              >
                Link your purchase
              </Link>{" "}
              and I&apos;ll offer you one here.
            </p>
          ) : coupon ? (
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
                  aria-label={`View ${item.name} at the store`}
                  className={cn(buttonVariants({ variant: "ghost", size: "md" }))}
                >
                  View at the store
                </a>
              </FrostedCard>
            ))}
          </div>

          <p className="text-[13px] leading-relaxed text-mist">
            These links open the store in a new tab. Purchases are made there,
            not in the app.
          </p>

          {/* R-6: this account no longer trips the bare support bar, because it
              now has three tabs. Without this the page it just gained would
              have no route to a person on it at all. */}
          {!guarantee && (
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
          )}
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
