import Link from "next/link";
import { notFound } from "next/navigation";
import { LivingSky } from "../../../../components/living-sky";
import { AppHeader } from "../../../../components/app-header";
import { DayCount } from "../../../../components/day-count";
import { ConciergeCard } from "../../../../components/concierge-card";
import { FrostedCard } from "../../../../components/ui/frosted-card";
import { Stat } from "../../../../components/ui/stat";
import { requireSignedInAllowUnlinked } from "../../../../lib/auth/app-session";
import { getRepository } from "../../../../lib/data";
import { effectiveReferenceDate } from "../../../../lib/demo-server";
import { statusLabel, statusNextStep } from "../../../../lib/claim-status";
import { raDocumentAvailable } from "../../../../lib/ra-document";
import { formatPlainDate } from "../../../../lib/dates";
import { journeyDay } from "../../../../lib/eligibility";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../../../../content/support";

/**
 * One exchange request (v2 #3, M5b).
 *
 * SECURITY — everywhere else in this app the client never names a claim id: the
 * fitting's actions resolve session → guarantee → its own open draft, so a
 * client cannot reach anyone else's request. This route is the first place a
 * claim id arrives from the URL, so it re-establishes the guarantee itself and
 * checks the claim against it. The URL id is never trusted on its own.
 *
 * A claim belonging to another guarantee must be INDISTINGUISHABLE from one that
 * does not exist: both are notFound(). Not a redirect, and no message that would
 * confirm the id is real.
 */
export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // v3 (M-S5): tolerant of an unlinked account — ownership can come from the
  // linked guarantee OR from the claim being linked to the account directly.
  const { session, guarantee, viewer } = await requireSignedInAllowUnlinked();
  const repo = getRepository();

  const claim = await repo.getClaimById(id);
  const ownsViaGuarantee = Boolean(
    claim && guarantee && claim.guaranteeId === guarantee.id
  );
  const ownsViaAccount = Boolean(
    claim && viewer && claim.consumerId && claim.consumerId === viewer.userId
  );
  if (!claim || (!ownsViaGuarantee && !ownsViaAccount)) notFound();
  // A draft has nothing to track — it lives at /fitting.
  if (claim.status === "draft") notFound();

  const [items, photos, journey] = await Promise.all([
    repo.listClaimItems(claim.id),
    repo.listClaimPhotos(claim.id),
    guarantee
      ? repo.getJourney(
          guarantee.id,
          await effectiveReferenceDate(guarantee.deliveryDate)
        )
      : Promise.resolve(null),
  ]);
  // Day count: the linked guarantee's journey when there is one; else the
  // claim's own self-reported delivery date (v3 anonymous claims).
  const day =
    journey?.currentDay ??
    (claim.deliveryDate
      ? journeyDay(claim.deliveryDate)
      : claim.daysInServiceAtSubmit ?? 0);
  const capturedAngles = photos.filter((p) => p.captured);
  // v3 claims carry a CG number and never speak RA/tracking language.
  const isV3 = Boolean(claim.claimNumber);

  return (
    <>
      <LivingSky day={day} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28"
      >
        <AppHeader email={session?.email ?? viewer?.email ?? null} />

        <div className="mt-8 space-y-6">
          <DayCount day={day} className="block" />
          <h1 className="!mt-2 font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            Your comfort exchange
          </h1>

          <ConciergeCard>{statusNextStep(claim.status)}</ConciergeCard>

          {isV3 ? (
            /* v3: the CG claim number is the single reference — no RA, no
               tracking language anywhere on these requests. */
            <FrostedCard className="space-y-4">
              <Stat label="Claim number" value={claim.claimNumber ?? "—"} />
              <p className="text-[13px] leading-relaxed text-mist">
                This number is how we&apos;ll both refer to your request — have
                it handy if you call or email.
              </p>
            </FrostedCard>
          ) : (
            <FrostedCard className="space-y-4">
              <Stat label="Return authorization" value={claim.raNumber ?? "—"} />
              <div className="border-t border-[var(--line)] pt-4">
                <Stat label="Tracking number" value={claim.trackingNumber ?? "—"} />
              </div>
              {/* The customer's own copy of the RA (Doug 2026-07-23) — only
                  once RAP has authorized the exchange. */}
              {claim.raNumber && raDocumentAvailable(claim.status) && (
                <a
                  href={`/requests/${claim.id}/ra`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block font-mono text-[11px] uppercase tracking-[0.12em] text-dawn transition-colors hover:text-cloud"
                >
                  Open the RA document &rsaquo;
                </a>
              )}
            </FrostedCard>
          )}

          <dl className="grid grid-cols-2 gap-3">
            <Cell label="Status" value={statusLabel(claim.status)} />
            <Cell
              label="Sent"
              value={claim.submittedAt ? formatPlainDate(claim.submittedAt) : "—"}
            />
          </dl>

          {isV3 && (
            <p className="text-[13px] leading-relaxed text-mist">
              Questions? Call us at {SUPPORT_PHONE} or email{" "}
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

        <Section title={items.length <= 1 ? "The mattress" : "The mattresses"}>
          {items.length === 0 ? (
            claim.modelNumber?.trim() ? (
              /* v3 requests carry the model number on the claim itself. */
              <p className="font-mono text-[14px] text-cloud/90">{claim.modelNumber}</p>
            ) : (
              <Quiet>No model numbers on this request.</Quiet>
            )
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-2.5 text-[15px] leading-relaxed text-cloud/90"
                >
                  <span aria-hidden className="mt-[2px] text-dawn">
                    &middot;
                  </span>
                  <span className="font-mono text-[14px]">{item.modelNumber}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="In your words">
          {claim.reasonExperience?.trim() ? (
            <p className="text-[15px] leading-relaxed text-cloud/90">
              {claim.reasonExperience}
            </p>
          ) : (
            <Quiet>Nothing recorded here.</Quiet>
          )}
          {claim.preferredReplacement?.trim() && (
            <>
              <h3 className="pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
                What you&apos;d rather have
              </h3>
              <p className="text-[15px] leading-relaxed text-cloud/90">
                {claim.preferredReplacement}
              </p>
            </>
          )}
        </Section>

        <Section title="Photos you captured">
          {capturedAngles.length === 0 ? (
            <Quiet>No photos on this request.</Quiet>
          ) : (
            <p className="text-[15px] leading-relaxed text-cloud/90">
              {capturedAngles.map((p) => p.label ?? p.angle).join(" · ")}
            </p>
          )}
        </Section>

        <div className="mt-10 border-t border-[var(--line)] pt-6">
          <Link
            href="/requests"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
          >
            All your requests
          </Link>
        </div>
      </main>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-10 space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
        {label}
      </dt>
      <dd className="break-words text-[15px] text-cloud">{value}</dd>
    </div>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-mist">{children}</p>;
}
