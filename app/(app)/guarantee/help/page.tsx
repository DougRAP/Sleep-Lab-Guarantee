import Link from "next/link";
import { LivingSky } from "../../../../components/living-sky";
import { AppHeader } from "../../../../components/app-header";
import { DayCount } from "../../../../components/day-count";
import { ConciergeCard } from "../../../../components/concierge-card";
import { FrostedCard } from "../../../../components/ui/frosted-card";
import { requireSignedInAllowUnlinked } from "../../../../lib/auth/app-session";
import { getRepository } from "../../../../lib/data";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../../../../content/support";

// Dealer triage (v2 #4). For non-comfort issues — damage, defects, anything
// outside the Comfort Guarantee — the customer is routed to their dealer, who
// handles these directly. Session-guarded. Shows the dealer contact from
// dealer_locations (via the session's guarantee), with a calm fallback if none
// is on file.
export default async function GuaranteeHelpPage() {
  // R-6: the unlinked Guarantee page links here, so demanding a purchase would
  // reproduce Emy's complaint one level down: a door that closes. Without a
  // purchase we do not know which dealer sold the mattress, but RAP is still
  // reachable, which is more than a redirect gives them.
  const { session, guarantee, viewer } = await requireSignedInAllowUnlinked();
  const email = session?.email ?? viewer?.email ?? null;
  if (!guarantee) return <UnlinkedHelp email={email} />;

  const repo = getRepository();

  const journey = await repo.getJourney(guarantee.id);
  const day = journey?.currentDay ?? 0;
  const dealer = await repo.getDealerLocationForGuarantee(guarantee.id);
  const dealerName = dealer?.name ?? guarantee.dealerName ?? "your dealer";

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={email} />

        <Link
          href="/guarantee"
          className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
        >
          &lsaquo; Guarantee
        </Link>

        <div className="mt-8 space-y-6">
          <DayCount day={day} className="block" />
          <h1 className="!mt-2 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            Something other than comfort
          </h1>

          <ConciergeCard>
            The Comfort Guarantee is for when a mattress simply doesn&apos;t feel
            right. For damage, a defect, or anything else, {dealerName} can help
            you directly — they know your order and can take it from there.
          </ConciergeCard>

          <FrostedCard className="space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
              Your dealer
            </p>
            <p className="font-serif text-[19px] leading-tight text-cloud">
              {dealerName}
            </p>

            <div className="space-y-3 pt-1">
              {dealer?.phone && (
                <ContactRow label="Phone">
                  <a
                    href={`tel:${dealer.phone.replace(/[^0-9+]/g, "")}`}
                    className="text-[15px] text-dawn underline-offset-4 hover:underline"
                  >
                    {dealer.phone}
                  </a>
                </ContactRow>
              )}
              {dealer?.email && (
                <ContactRow label="Email">
                  <a
                    href={`mailto:${dealer.email}`}
                    className="text-[15px] text-dawn underline-offset-4 hover:underline"
                  >
                    {dealer.email}
                  </a>
                </ContactRow>
              )}
              {dealer?.siteUrl && (
                <ContactRow label="Online">
                  <a
                    href={dealer.siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[15px] text-dawn underline-offset-4 hover:underline"
                  >
                    Visit dealer site
                  </a>
                </ContactRow>
              )}
              {!dealer?.phone && !dealer?.email && !dealer?.siteUrl && (
                <p className="text-[15px] leading-relaxed text-mist">
                  Please reach out to the dealer where you purchased your
                  mattress — they can help with anything outside the Comfort
                  Guarantee.
                </p>
              )}
            </div>
          </FrostedCard>

          <p className="text-[13px] leading-relaxed text-mist">
            Manufacturing defects and warranty matters are handled by your dealer
            or the manufacturer, separately from the 90-Night Comfort Guarantee.
          </p>
        </div>
      </main>
    </>
  );
}

/**
 * R-6: the same page for an account with no purchase on file.
 *
 * This page exists to hand the customer their DEALER, which comes off the
 * guarantee. With none linked we cannot name one, so it says that plainly and
 * gives them RAP, from the one place those contacts live (content/support.ts).
 */
function UnlinkedHelp({ email }: { email: string | null }) {
  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={email} />

        <Link
          href="/guarantee"
          className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
        >
          &lsaquo; Guarantee
        </Link>

        <div className="mt-8 space-y-6">
          <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            Something other than comfort
          </h1>

          <ConciergeCard>
            The Comfort Guarantee is for when a mattress simply doesn&apos;t feel
            right. For damage, a defect, or anything else, the store that sold it
            to you handles it directly. Link your purchase and I&apos;ll show you
            who that is, or reach us and we&apos;ll point you their way.
          </ConciergeCard>

          <FrostedCard className="space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
              Reach us
            </p>
            <div className="space-y-3 pt-1">
              <ContactRow label="Phone">
                <a
                  href={`tel:${SUPPORT_PHONE.replace(/[^0-9+]/g, "")}`}
                  className="text-[15px] text-dawn underline-offset-4 hover:underline"
                >
                  {SUPPORT_PHONE}
                </a>
              </ContactRow>
              <ContactRow label="Email">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-[15px] text-dawn underline-offset-4 hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
              </ContactRow>
            </div>
          </FrostedCard>

          <p className="text-[13px] leading-relaxed text-mist">
            Bought a mattress and want your 90 nights here too?{" "}
            <Link
              href="/link"
              className="text-dawn underline-offset-4 transition-colors hover:underline"
            >
              Link your purchase
            </Link>
            .
          </p>

          <p className="text-[13px] leading-relaxed text-mist">
            Manufacturing defects and warranty matters are handled by your dealer
            or the manufacturer, separately from the 90-Night Comfort Guarantee.
          </p>
        </div>
      </main>
    </>
  );
}

function ContactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}
