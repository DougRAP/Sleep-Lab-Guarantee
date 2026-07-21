import Link from "next/link";
import { redirect } from "next/navigation";
import { LivingSky } from "../../components/living-sky";
import { Logo } from "../../components/Logo";
import { FrostedCard } from "../../components/ui/frosted-card";
import { Field } from "../../components/ui/field";
import { Button, buttonVariants } from "../../components/ui/button";
import { SignOut } from "../../components/auth/sign-out";
import { StatusChip } from "../../components/ui/status-chip";
import { DemoViewBanner } from "../../components/admin/demo-view-banner";
import { chooseDemoStaffViewAction } from "../../lib/actions/staff";
import { getRepository } from "../../lib/data";
import {
  resolveStaffView,
  staffScope,
  type StaffView,
} from "../../lib/auth/staff-view";
import { formatDayMonth } from "../../lib/dates";
import { cn } from "../../lib/utils";
import type { ClaimRecord } from "../../lib/data/repository";

// Never prerender: what this screen shows depends on the visitor's session and
// role, so it must be resolved per request regardless of build-time env.
export const dynamic = "force-dynamic";

/**
 * The staff requests desk — an OFFICE tool, so the layout is desktop-first
 * (wide container, comfortable rows) and merely degrades politely on a phone.
 *
 * Who is looking is resolved by lib/auth/staff-view.ts: the real
 * guardAdminRoute + getViewer path when Supabase is configured (untouched),
 * or the demo staff viewer when it isn't. rap_admin sees everything; a dealer
 * sees only their own location's requests — the scope is applied inside the
 * repository read, never here.
 *
 * Lives outside the (app) route group, so no consumer bottom nav.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const resolved = await resolveStaffView();
  if (resolved.kind === "redirect") redirect(resolved.to);
  if (resolved.kind === "picker") return <DemoRolePicker />;
  const view = resolved.view;

  const repo = getRepository();
  const records = await repo.listClaimRecords(staffScope(view), query || undefined);
  const dealerName = view.dealerLocationId
    ? (await repo.getDealerLocationById(view.dealerLocationId))?.name ?? null
    : null;

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-6 pb-12 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            {view.role === "dealer" ? "Dealer" : "RAP"}
          </span>
        </div>

        {view.demo && <DemoViewBanner label={viewLabel(view, dealerName)} />}

        <div className="mt-8 space-y-2">
          <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            Exchange requests
          </h1>
          <p className="text-[13px] leading-relaxed text-mist">
            {view.role === "dealer"
              ? "Requests from your location. Adjudication stays in RAP's systems."
              : "Every submitted request. Adjudication stays in RAP's existing systems."}
          </p>
        </div>

        <form method="get" action="/admin" className="mt-6 flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Field
              label="Search"
              name="q"
              defaultValue={query}
              placeholder="Order #, guarantee #, or customer name"
              autoComplete="off"
            />
          </div>
          <Button type="submit" variant="ghost" size="md" className="h-12 shrink-0">
            Search
          </Button>
          {query && (
            <Link
              href="/admin"
              className={cn(
                buttonVariants({ variant: "quiet", size: "md" }),
                "h-12 shrink-0"
              )}
            >
              Clear
            </Link>
          )}
        </form>

        <div className="mt-6 space-y-3">
          {records.length === 0 ? (
            <FrostedCard>
              <p className="text-[15px] leading-relaxed text-mist">
                {query
                  ? `No matches for “${query}”. Try an order number, a guarantee number, or a last name.`
                  : "No requests yet. Submitted exchanges appear here with their RA and tracking numbers."}
              </p>
            </FrostedCard>
          ) : (
            records.map((record) => <AdminRow key={record.claimId} record={record} />)
          )}
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-[var(--line)] pt-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            {records.length} {records.length === 1 ? "request" : "requests"}
            {query ? ` · “${query}”` : ""}
          </span>
          {!view.demo && <SignOut />}
        </div>
      </main>
    </>
  );
}

/** "Dealer — Demo Bedding Co." / "RAP admin" for the demo-view indicator. */
function viewLabel(view: StaffView, dealerName: string | null): string {
  if (view.role === "dealer") {
    return dealerName ? `Dealer — ${dealerName}` : "Dealer";
  }
  return "RAP admin";
}

/** One request, the whole row a link into the staff detail page. */
function AdminRow({ record }: { record: ClaimRecord }) {
  return (
    <Link
      href={`/admin/requests/${record.claimId}`}
      className="block rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dawn/60"
    >
      <FrostedCard className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-serif text-[19px] leading-tight text-cloud">
              {record.customerName}
            </p>
            <StatusChip status={record.status} />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            Order {record.salesOrderNumber} &middot; Day {record.day} / 90
          </p>
        </div>

        <dl className="grid shrink-0 grid-cols-3 gap-6 sm:w-[400px]">
          <Cell label="RA" value={record.raNumber} />
          <Cell label="Tracking" value={record.trackingNumber} />
          <Cell
            label="Updated"
            value={record.updatedAt ? formatDayMonth(record.updatedAt) : null}
          />
        </dl>
      </FrostedCard>
    </Link>
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

/**
 * Shown when Supabase (and therefore sign-in) isn't configured and no demo
 * view has been chosen: the DEMO staff viewer's front door. Two canned views,
 * nothing else — the server action refuses outright once Supabase is
 * configured, so this picker can never shadow real auth.
 */
function DemoRolePicker() {
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
            Choose a view.
          </h1>
          <p className="text-[15px] leading-relaxed text-mist">
            Sign-in isn&apos;t configured yet, so this is the demo staff view.
            Pick a role to see the requests desk the way they would. Once
            Supabase is connected, real accounts take over here.
          </p>
          <form action={chooseDemoStaffViewAction} className="space-y-3">
            <Button type="submit" name="role" value="dealer" variant="ghost" size="lg">
              View as Dealer &mdash; Demo Bedding Co.
            </Button>
            <Button type="submit" name="role" value="rap_admin" variant="ghost" size="lg">
              View as RAP admin
            </Button>
          </form>
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
          >
            Back to the app
          </Link>
        </div>
      </main>
    </>
  );
}
