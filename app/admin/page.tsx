import Link from "next/link";
import { redirect } from "next/navigation";
import { LivingSky } from "../../components/living-sky";
import { Logo } from "../../components/Logo";
import { FrostedCard } from "../../components/ui/frosted-card";
import { buttonVariants } from "../../components/ui/button";
import { SignOut } from "../../components/auth/sign-out";
import { isAuthConfigured } from "../../lib/auth/config";
import { getViewer } from "../../lib/auth/user";
import { getRepository } from "../../lib/data";
import { guardAdminRoute } from "../../lib/auth/routing";
import { cn } from "../../lib/utils";
import type { ClaimRecord, ClaimRecordScope } from "../../lib/data/repository";
import type { ClaimStatus } from "../../lib/types";

// Never prerender: what this screen shows depends on the visitor's session and
// role, so it must be resolved per request regardless of build-time env.
export const dynamic = "force-dynamic";

/**
 * The thin admin. Deliberately READ-ONLY: a list of exchange requests so the
 * login leads somewhere real. The locked decision is "data seam now, thin admin
 * later" — RAP adjudicates in its existing systems, so there is no approve/deny
 * workflow, no notes, no stats here.
 *
 * rap_admin sees everything; a dealer sees only their own location's requests.
 * Lives outside the (app) route group, so no consumer bottom nav.
 */
export default async function AdminPage() {
  const authConfigured = isAuthConfigured();
  const viewer = authConfigured ? await getViewer() : null;
  const linked = viewer
    ? Boolean(await getRepository().getGuaranteeForUser(viewer.userId))
    : false;

  const to = guardAdminRoute({
    authConfigured,
    authenticated: Boolean(viewer),
    linked,
    role: viewer?.role ?? null,
    hasLightSession: false,
  });
  if (to) redirect(to);

  // No Supabase means no way to prove a role. Say so calmly rather than
  // bouncing into a login that cannot work.
  if (!authConfigured || !viewer) return <AdminUnavailable />;

  const scope: ClaimRecordScope =
    viewer.role === "dealer" && viewer.dealerLocationId
      ? { kind: "dealer_location", dealerLocationId: viewer.dealerLocationId }
      : { kind: "all" };

  const records = await getRepository().listClaimRecords(scope);

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-12 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            {viewer.role === "dealer" ? "Dealer" : "RAP"}
          </span>
        </div>

        <div className="mt-8 space-y-2">
          <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            Exchange requests
          </h1>
          <p className="text-[13px] leading-relaxed text-mist">
            {viewer.role === "dealer"
              ? "Requests from your location. Read-only — adjudication stays in RAP's systems."
              : "Every submitted request. Read-only — adjudication stays in RAP's existing systems."}
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {records.length === 0 ? (
            <FrostedCard>
              <p className="text-[15px] leading-relaxed text-mist">
                No requests yet. Submitted exchanges appear here with their RA and
                tracking numbers.
              </p>
            </FrostedCard>
          ) : (
            records.map((record) => <AdminRow key={record.claimId} record={record} />)
          )}
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-[var(--line)] pt-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            {records.length} {records.length === 1 ? "request" : "requests"}
          </span>
          <SignOut />
        </div>
      </main>
    </>
  );
}

function AdminRow({ record }: { record: ClaimRecord }) {
  return (
    <FrostedCard className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-serif text-[19px] leading-tight text-cloud">
            {record.customerName}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            Order {record.salesOrderNumber}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line)] bg-white/[0.03] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-dawn">
          {statusLabel(record.status)}
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <Cell label="RA" value={record.raNumber} />
        <Cell label="Tracking" value={record.trackingNumber} />
        <Cell label="Day" value={`${record.day} / 90`} />
      </dl>
    </FrostedCard>
  );
}

function Cell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
        {label}
      </dt>
      <dd className="break-words font-mono text-[13px] text-cloud">
        {value ?? "—"}
      </dd>
    </div>
  );
}

/** The status machine in plain language — no ticket-speak. */
function statusLabel(status: ClaimStatus): string {
  const labels: Record<ClaimStatus, string> = {
    draft: "In progress",
    submitted: "Submitted",
    in_review: "In review",
    approved: "Approved",
    dealer_scheduled: "Scheduled",
    completed: "Completed",
    denied: "Declined",
    expired: "Expired",
    withdrawn: "Withdrawn",
  };
  return labels[status] ?? status;
}

/** Shown when Supabase (and therefore sign-in) isn't configured yet. */
function AdminUnavailable() {
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
          <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            Not switched on yet.
          </h1>
          <p className="text-[15px] leading-relaxed text-mist">
            The RAP view needs sign-in configured before it can show anything.
            Once Supabase is connected, this is where submitted exchange requests
            appear.
          </p>
          <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}>
            Back to the app
          </Link>
        </div>
      </main>
    </>
  );
}
