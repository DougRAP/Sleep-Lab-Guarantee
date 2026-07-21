import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LivingSky } from "../../../../components/living-sky";
import { Logo } from "../../../../components/Logo";
import { FrostedCard } from "../../../../components/ui/frosted-card";
import { Stat } from "../../../../components/ui/stat";
import { Button } from "../../../../components/ui/button";
import { StatusChip } from "../../../../components/ui/status-chip";
import { SignOut } from "../../../../components/auth/sign-out";
import { DemoViewBanner } from "../../../../components/admin/demo-view-banner";
import {
  addStaffNoteAction,
  updateStaffClaimStatusAction,
} from "../../../../lib/actions/staff";
import { getRepository } from "../../../../lib/data";
import {
  resolveStaffView,
  staffScope,
  type StaffView,
} from "../../../../lib/auth/staff-view";
import { ADMIN_PATH } from "../../../../lib/auth/routing";
import { permittedClaimStatusTransitions } from "../../../../lib/data/repository";
import { statusLabel, statusNextStep } from "../../../../lib/claim-status";
import { formatPlainDate } from "../../../../lib/dates";
import type { ClaimNote } from "../../../../lib/types";

export const dynamic = "force-dynamic";

/**
 * One request, from the STAFF side — desktop-first, like the /admin list it
 * belongs to. Same view resolution as /admin (real guard or demo viewer).
 *
 * SECURITY — the claim id arrives from the URL, so it is fetched through the
 * scope-aware getClaimRecord: a dealer asking about another location's claim
 * gets null, which renders as notFound() — indistinguishable from an id that
 * doesn't exist, exactly the consumer detail page's ownership rule.
 */
export default async function StaffRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const resolved = await resolveStaffView();
  if (resolved.kind === "redirect") redirect(resolved.to);
  // No demo view chosen yet — the picker on /admin is the front door.
  if (resolved.kind === "picker") redirect(ADMIN_PATH);
  const view = resolved.view;

  const repo = getRepository();
  const record = await repo.getClaimRecord(staffScope(view), id);
  if (!record) notFound();

  const [items, photos, allNotes, dealerLocation] = await Promise.all([
    repo.listClaimItems(record.claimId),
    repo.listClaimPhotos(record.claimId),
    repo.listClaimNotes(record.claimId),
    view.dealerLocationId
      ? repo.getDealerLocationById(view.dealerLocationId)
      : Promise.resolve(null),
  ]);
  // is_internal notes are admin-only (the schema's rule) — dealers never see them.
  const notes =
    view.role === "rap_admin" ? allNotes : allNotes.filter((n) => !n.isInternal);
  const photoCount = photos.filter((p) => p.captured).length;
  const transitions =
    view.role === "rap_admin" ? permittedClaimStatusTransitions(record.status) : [];

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col px-6 pb-12 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            {view.role === "dealer" ? "Dealer" : "RAP"}
          </span>
        </div>

        {view.demo && <DemoViewBanner label={viewLabel(view, dealerLocation?.name ?? null)} />}

        <div className="mt-8">
          <Link
            href={ADMIN_PATH}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
          >
            &lsaquo; All requests
          </Link>
        </div>

        <div className="mt-6 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
              {record.customerName}
            </h1>
            <StatusChip status={record.status} />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
            Order {record.salesOrderNumber} &middot; Day {record.day} / 90
          </p>
          <p className="text-[15px] leading-relaxed text-mist">
            {statusNextStep(record.status)}
          </p>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_320px]">
          {/* Left: the request itself + the thread */}
          <div className="min-w-0">
            <FrostedCard className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <Stat label="Return authorization" value={record.raNumber ?? "—"} />
              <Stat label="Tracking number" value={record.trackingNumber ?? "—"} />
            </FrostedCard>

            <Section title={items.length === 1 ? "The mattress" : "The mattresses"}>
              {items.length === 0 ? (
                <Quiet>No model numbers on this request.</Quiet>
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

            <Section title="Notes">
              {notes.length === 0 ? (
                <Quiet>No notes yet. What&apos;s said here is shared between the dealer and RAP.</Quiet>
              ) : (
                <ul className="space-y-4">
                  {notes.map((note) => (
                    <NoteItem key={note.id} note={note} />
                  ))}
                </ul>
              )}

              <form action={addStaffNoteAction} className="space-y-3 pt-2">
                <input type="hidden" name="claimId" value={record.claimId} />
                <div className="space-y-1.5">
                  <label
                    htmlFor="staff-note-body"
                    className="block font-mono text-[11px] uppercase tracking-[0.12em] text-mist"
                  >
                    Add a note
                  </label>
                  <textarea
                    id="staff-note-body"
                    name="body"
                    rows={3}
                    required
                    placeholder="Visible to both the dealer and RAP."
                    className="w-full rounded-xl border border-[var(--line)] bg-white/[0.04] px-4 py-3 text-[15px] leading-relaxed text-cloud outline-none transition-colors placeholder:text-mist/60 focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
                  />
                </div>
                <Button type="submit" variant="ghost" size="md">
                  Add note
                </Button>
              </form>
            </Section>
          </div>

          {/* Right: the facts at a glance + RAP's status control */}
          <div className="min-w-0">
            <FrostedCard className="space-y-4">
              <dl className="grid grid-cols-2 gap-4">
                <Cell label="Status" value={statusLabel(record.status)} />
                <Cell
                  label="Photos"
                  value={`${photoCount} ${photoCount === 1 ? "capture" : "captures"}`}
                />
                <Cell
                  label="Submitted"
                  value={record.submittedAt ? formatPlainDate(record.submittedAt) : "—"}
                />
                <Cell
                  label="Updated"
                  value={record.updatedAt ? formatPlainDate(record.updatedAt) : "—"}
                />
              </dl>
            </FrostedCard>

            {transitions.length > 0 && (
              <Section title="Update status">
                <Quiet>
                  Stands in for the CRM posting back. The customer sees the
                  change in their own tracking view.
                </Quiet>
                <form
                  action={updateStaffClaimStatusAction}
                  className="flex flex-wrap gap-2"
                >
                  <input type="hidden" name="claimId" value={record.claimId} />
                  {transitions.map((status) => (
                    <Button
                      key={status}
                      type="submit"
                      name="status"
                      value={status}
                      variant="ghost"
                      size="sm"
                    >
                      {statusLabel(status)}
                    </Button>
                  ))}
                </form>
              </Section>
            )}
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-[var(--line)] pt-6">
          <Link
            href={ADMIN_PATH}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
          >
            All requests
          </Link>
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

function NoteItem({ note }: { note: ClaimNote }) {
  const author =
    note.author === "dealer" ? "Dealer" : note.author === "rap_admin" ? "RAP" : "Staff";
  return (
    <li className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
        {author}
        {note.createdAt ? ` · ${formatPlainDate(note.createdAt)}` : ""}
      </p>
      <p className="text-[15px] leading-relaxed text-cloud/90">{note.body}</p>
    </li>
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
    <div className="mt-8 space-y-3">
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
