import { redirect } from "next/navigation";
import Link from "next/link";
import { LivingSky } from "../../../../components/living-sky";
import { Logo } from "../../../../components/Logo";
import { DayCount } from "../../../../components/day-count";
import { ConciergeCard } from "../../../../components/concierge-card";
import { FrostedCard } from "../../../../components/ui/frosted-card";
import { getSession } from "../../../../lib/session";
import { getRepository } from "../../../../lib/data";

// Dealer triage (v2 #4). For non-comfort issues — damage, defects, anything
// outside the Comfort Guarantee — the customer is routed to their dealer, who
// handles these directly. Session-guarded. Shows the dealer contact from
// dealer_locations (via the session's guarantee), with a calm fallback if none
// is on file.
export default async function GuaranteeHelpPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const repo = getRepository();
  const guarantee = await repo.getGuaranteeById(session.guaranteeId);
  if (!guarantee) redirect("/");

  const journey = await repo.getJourney(guarantee.id);
  const day = journey?.currentDay ?? 0;
  const dealer = await repo.getDealerLocationForGuarantee(guarantee.id);
  const dealerName = dealer?.name ?? guarantee.dealerName ?? "your dealer";

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
