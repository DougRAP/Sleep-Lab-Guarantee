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
import { statusLabel } from "../../lib/claim-status";
import { cn } from "../../lib/utils";
import { ADJUDICATION_STATUSES } from "../../lib/data/repository";
import type { ClaimRecord } from "../../lib/data/repository";
import type { ClaimStatus } from "../../lib/types";

/** YYYY-MM-DD or nothing — date filters never throw on garbage input. */
function isPlainDate(value: string | undefined): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

// Never prerender: what this screen shows depends on the visitor's session and
// role, so it must be resolved per request regardless of build-time env.
export const dynamic = "force-dynamic";

// The desk is about exchange requests — the tab should say so too (review
// 2026-07-22: "should probably rename that Exchange Requests").
export const metadata = { title: "Exchange requests · RAP Sleep Lab" };

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
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string }>;
}) {
  const { q, status, from, to } = await searchParams;
  const query = (q ?? "").trim();
  // Standard filters (review 2026-07-22): status + submitted date range.
  // Unknown values degrade to "no filter", never to an error.
  const statusFilter = ADJUDICATION_STATUSES.includes(status as ClaimStatus)
    ? (status as ClaimStatus)
    : null;
  const fromFilter = isPlainDate(from) ? (from as string) : null;
  const toFilter = isPlainDate(to) ? (to as string) : null;
  const filtered = Boolean(statusFilter || fromFilter || toFilter);

  const resolved = await resolveStaffView();
  if (resolved.kind === "redirect") redirect(resolved.to);
  if (resolved.kind === "picker") return <DemoRolePicker />;
  const view = resolved.view;

  const repo = getRepository();
  // B-18 fix 2: the list and the dealer's name are independent reads — in
  // parallel they cost one round-trip instead of two.
  const [records, dealerName] = await Promise.all([
    repo.listClaimRecords(staffScope(view), query || undefined, {
      status: statusFilter,
      submittedFrom: fromFilter,
      submittedTo: toFilter,
    }),
    view.dealerLocationId
      ? repo.getDealerLocationById(view.dealerLocationId).then((d) => d?.name ?? null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-6 pb-12 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between gap-4">
          <Logo />
          <div className="flex min-w-0 items-center gap-4">
            {view.email && (
              <span
                title={view.email}
                className="min-w-0 truncate font-mono text-[11px] tracking-[0.02em] text-mist"
              >
                {view.email}
              </span>
            )}
            {!view.demo && <SignOut className="shrink-0" />}
          </div>
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
          {view.role === "rap_admin" && (
            <p className="text-[13px]">
              <Link
                href="/admin/coach"
                className="text-mist underline-offset-4 hover:underline"
              >
                Coach usage &rarr;
              </Link>
            </p>
          )}
        </div>

        <form method="get" action="/admin" className="mt-6 space-y-3">
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <Field
                label="Search"
                name="q"
                defaultValue={query}
                placeholder="Order #, guarantee #, name, email, or phone"
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="ghost" size="md" className="h-12 shrink-0">
              Search
            </Button>
            {(query || filtered) && (
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
          </div>

          {/* The standard filters (review 2026-07-22): status + date range. */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <label
                htmlFor="status-filter"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-mist"
              >
                Status
              </label>
              <select
                id="status-filter"
                name="status"
                defaultValue={statusFilter ?? ""}
                className="h-12 w-full rounded-xl border border-[var(--line)] bg-white/[0.04] px-3 text-[16px] text-cloud outline-none transition-colors focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
              >
                <option value="">All statuses</option>
                {ADJUDICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-44">
              <Field
                label="Submitted from"
                name="from"
                type="date"
                defaultValue={fromFilter ?? ""}
              />
            </div>
            <div className="w-44">
              <Field
                label="Submitted to"
                name="to"
                type="date"
                defaultValue={toFilter ?? ""}
              />
            </div>
          </div>
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
        </div>
      </main>
    </>
  );
}

/** "Dealer — City Mattress" / "RAP admin" for the demo-view indicator. */
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
              View as Dealer &mdash; City Mattress
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
