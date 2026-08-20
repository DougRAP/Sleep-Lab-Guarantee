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
  addClaimLinkAction,
  addStaffNoteAction,
  recordExchangeSalesOrderAction,
  updateStaffClaimStatusAction,
} from "../../../../lib/actions/staff";
import { getRepository } from "../../../../lib/data";
import {
  resolveStaffView,
  staffScope,
  type StaffView,
} from "../../../../lib/auth/staff-view";
import { ADMIN_PATH } from "../../../../lib/auth/routing";
import {
  EXCHANGE_RECORDABLE_STATUSES,
  permittedClaimStatusTransitions,
} from "../../../../lib/data/repository";
import { statusLabel, statusNextStep } from "../../../../lib/claim-status";
import { raDocumentAvailable } from "../../../../lib/ra-document";
import { formatPlainDate } from "../../../../lib/dates";
import { CONFIRMATION_TERMS } from "../../../../lib/fitting";
import type { ClaimLink, ClaimLinkKind, ClaimNote } from "../../../../lib/types";

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

  const [items, photos, allNotes, links, claim, dealerLocation] = await Promise.all([
    repo.listClaimItems(record.claimId),
    repo.listClaimPhotos(record.claimId),
    repo.listClaimNotes(record.claimId),
    repo.listClaimLinks(record.claimId),
    // The scope was already proven by getClaimRecord above; the full claim row
    // carries the exchange sales order number the record view doesn't.
    repo.getClaimById(record.claimId),
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
  // Newest attachment first — the latest EA or tech report is what the desk
  // reaches for. The repo returns oldest-first like the notes thread.
  const documents = [...links].reverse();
  const confirmed = new Set(claim?.confirmations ?? []);

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col px-6 pb-12 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
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
            {record.claimNumber ? `Claim ${record.claimNumber} · ` : ""}
            Order {record.salesOrderNumber ?? "—"} &middot; Day {record.day ?? "—"} / 90
          </p>
          {record.guaranteeId === null && (
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-dawn">
              Unmatched &mdash; no registered guarantee
            </p>
          )}
          <p className="text-[15px] leading-relaxed text-mist">
            {statusNextStep(record.status)}
          </p>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_320px]">
          {/* Left: the request itself + the thread */}
          <div className="min-w-0">
            <FrostedCard className="space-y-5">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <Stat label="Claim number" value={record.claimNumber ?? "—"} />
                {/* RAP production reference, written back by their integration.
                    Read-only here — the app never edits it. */}
                <Stat label="TTC claim" value={record.ttcClaim ?? "—"} />
              </div>
              {/* Legacy references — only on rows minted before v3. */}
              {(record.raNumber || record.trackingNumber) && (
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                  <Stat label="Return authorization" value={record.raNumber ?? "—"} />
                  <Stat label="Tracking number" value={record.trackingNumber ?? "—"} />
                </div>
              )}
              {record.raNumber && raDocumentAvailable(record.status) && (
                <a
                  href={`${ADMIN_PATH}/requests/${record.claimId}/ra`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block font-mono text-[11px] uppercase tracking-[0.12em] text-dawn transition-colors hover:text-cloud"
                >
                  Open the RA document &rsaquo;
                </a>
              )}
            </FrostedCard>

            <Section title="The claimant">
              <dl className="grid grid-cols-2 gap-4">
                <Cell label="Name" value={record.customerName} />
                <Cell label="Delivery ZIP" value={record.deliveryZip ?? "—"} />
                <Cell
                  label="Phone"
                  value={
                    claim?.contactPhone
                      ? `${claim.contactPhone}${claim.contactPhoneKind ? ` (${claim.contactPhoneKind})` : ""}`
                      : "—"
                  }
                />
                <Cell label="Email" value={claim?.contactEmail ?? "—"} />
                {/* Agent-entered address (production write-back, like TTC). */}
                <Cell
                  label="Address"
                  value={
                    claim?.customerStreet
                      ? [
                          claim.customerStreet,
                          claim.customerStreet2,
                          [
                            claim.customerCity,
                            claim.customerState,
                            claim.customerZip,
                          ]
                            .filter(Boolean)
                            .join(", "),
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : "—"
                  }
                />
                <Cell label="Sales order" value={record.salesOrderNumber ?? "—"} />
                <Cell label="Model number" value={claim?.modelNumber ?? "—"} />
                <Cell
                  label="Purchased"
                  value={claim?.purchaseDate ? formatPlainDate(claim.purchaseDate) : "—"}
                />
                <Cell
                  label="Delivered"
                  value={claim?.deliveryDate ? formatPlainDate(claim.deliveryDate) : "—"}
                />
                <Cell
                  label="Days in service at submit"
                  value={
                    record.daysInServiceAtSubmit != null
                      ? String(record.daysInServiceAtSubmit)
                      : "—"
                  }
                />
                <Cell
                  label="Protector used"
                  value={
                    record.protectorUsed == null
                      ? "—"
                      : record.protectorUsed
                        ? "Yes"
                        : "No"
                  }
                />
                <Cell
                  label="Early preference"
                  value={
                    record.earlyPreference === "agent_call"
                      ? "Wants a call from an agent"
                      : record.earlyPreference === "auto_submit_day_31"
                        ? "Auto-submit at day 31"
                        : "—"
                  }
                />
              </dl>
            </Section>

            {(claim?.reasonExperience || claim?.preferredReplacement) && (
              <Section title="In their words">
                {claim?.reasonExperience && (
                  <div className="space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
                      What isn&apos;t working
                    </p>
                    <p className="whitespace-pre-line text-[15px] leading-relaxed text-cloud/90">
                      {claim.reasonExperience}
                    </p>
                  </div>
                )}
                {claim?.preferredReplacement && (
                  <div className="space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
                      What they&apos;d rather have
                    </p>
                    <p className="whitespace-pre-line text-[15px] leading-relaxed text-cloud/90">
                      {claim.preferredReplacement}
                    </p>
                  </div>
                )}
              </Section>
            )}

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

            <Section
              title={`Confirmations · ${confirmed.size} of ${CONFIRMATION_TERMS.length}`}
            >
              {confirmed.size === 0 ? (
                <Quiet>No terms confirmed on this request.</Quiet>
              ) : (
                <ul className="space-y-2">
                  {CONFIRMATION_TERMS.filter((t) => confirmed.has(t.key)).map((t) => (
                    <li
                      key={t.key}
                      className="flex gap-2.5 text-[15px] leading-relaxed text-cloud/90"
                    >
                      <span aria-hidden className="mt-[2px] text-dawn">
                        &middot;
                      </span>
                      <span>{t.statement}</span>
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
                    className="w-full rounded-xl border border-[var(--line)] bg-white/[0.04] px-4 py-3 text-[16px] leading-relaxed text-cloud outline-none transition-colors placeholder:text-mist/60 focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
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

            {/* Documents RAP attaches (v3 §5): the exchange authorization and
                tech reports, so the dealer's team works from the same papers.
                Dealers read; only RAP writes. */}
            <Section title="Documents">
              {documents.length === 0 ? (
                <Quiet>
                  No documents yet. Exchange authorizations and tech reports
                  attached here are visible to both the dealer and RAP.
                </Quiet>
              ) : (
                <ul className="space-y-3">
                  {documents.map((link) => (
                    <DocumentItem key={link.id} link={link} />
                  ))}
                </ul>
              )}

              {view.role === "rap_admin" && (
                <form action={addClaimLinkAction} className="space-y-3 pt-2">
                  <input type="hidden" name="claimId" value={record.claimId} />
                  <div className="space-y-1.5">
                    <label
                      htmlFor="claim-link-kind"
                      className="block font-mono text-[11px] uppercase tracking-[0.12em] text-mist"
                    >
                      Attach a document link
                    </label>
                    <select
                      id="claim-link-kind"
                      name="kind"
                      defaultValue="exchange_authorization"
                      className="h-12 w-full rounded-xl border border-[var(--line)] bg-white/[0.04] px-3 text-[16px] text-cloud outline-none transition-colors focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
                    >
                      <option value="exchange_authorization">
                        Exchange authorization
                      </option>
                      <option value="tech_report">Tech report</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <input
                    aria-label="Document URL"
                    name="url"
                    type="url"
                    required
                    placeholder="https://…"
                    autoComplete="off"
                    className="h-12 w-full rounded-xl border border-[var(--line)] bg-white/[0.04] px-4 font-mono text-[14px] text-cloud outline-none transition-colors placeholder:text-mist/60 focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
                  />
                  <input
                    aria-label="Label"
                    name="label"
                    placeholder="Label (optional)"
                    autoComplete="off"
                    className="h-12 w-full rounded-xl border border-[var(--line)] bg-white/[0.04] px-4 text-[16px] text-cloud outline-none transition-colors placeholder:text-mist/60 focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
                  />
                  <Button type="submit" variant="ghost" size="md">
                    Attach link
                  </Button>
                </form>
              )}
            </Section>

            {/* The dealer's one write (review 2026-07-22): when the customer
                reselects in-store, the store records the NEW sales order
                number, which completes the exchange. Offered to both roles,
                only once RAP has authorized. */}
            {(claim?.exchangeSalesOrderNumber ||
              EXCHANGE_RECORDABLE_STATUSES.has(record.status)) && (
              <Section title="Exchange sales order">
                {claim?.exchangeSalesOrderNumber ? (
                  <p className="font-mono text-[15px] text-cloud">
                    {claim.exchangeSalesOrderNumber}
                  </p>
                ) : (
                  <Quiet>
                    When the exchange happens in-store, write in the new sales
                    order number. That completes this request.
                  </Quiet>
                )}
                {EXCHANGE_RECORDABLE_STATUSES.has(record.status) && (
                  <form action={recordExchangeSalesOrderAction} className="space-y-3">
                    <input type="hidden" name="claimId" value={record.claimId} />
                    <input
                      aria-label="Exchange sales order number"
                      name="exchangeSalesOrderNumber"
                      required
                      defaultValue={claim?.exchangeSalesOrderNumber ?? ""}
                      placeholder="New sales order #"
                      autoComplete="off"
                      className="h-12 w-full rounded-xl border border-[var(--line)] bg-white/[0.04] px-4 font-mono text-[16px] text-cloud outline-none transition-colors placeholder:text-mist/60 focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
                    />
                    <Button type="submit" variant="ghost" size="md">
                      {claim?.exchangeSalesOrderNumber
                        ? "Update exchange order"
                        : "Record exchange"}
                    </Button>
                  </form>
                )}
              </Section>
            )}

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

/** "Dealer — City Mattress" / "RAP admin" for the demo-view indicator. */
function viewLabel(view: StaffView, dealerName: string | null): string {
  if (view.role === "dealer") {
    return dealerName ? `Dealer — ${dealerName}` : "Dealer";
  }
  return "RAP admin";
}

/** Plain-language name for a link kind — never the raw machine key. */
function linkKindLabel(kind: ClaimLinkKind): string {
  const labels: Record<ClaimLinkKind, string> = {
    exchange_authorization: "Exchange authorization",
    tech_report: "Tech report",
    other: "Document",
  };
  return labels[kind] ?? "Document";
}

function DocumentItem({ link }: { link: ClaimLink }) {
  return (
    <li className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
        {linkKindLabel(link.kind)}
        {link.createdAt ? ` · ${formatPlainDate(link.createdAt)}` : ""}
      </p>
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className="block break-words text-[15px] leading-relaxed text-dawn underline-offset-4 transition-colors hover:text-cloud hover:underline"
      >
        {link.label || link.url}
      </a>
    </li>
  );
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
