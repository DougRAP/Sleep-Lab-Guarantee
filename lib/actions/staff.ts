// lib/actions/staff.ts
// Server actions for the staff surfaces (/admin + /admin/requests/[id]).
//
// Every action re-resolves the staff view SERVER-SIDE (real viewer or demo
// cookie — lib/auth/staff-view.ts) and re-checks scope through the repository;
// nothing trusts the form beyond "which claim, which status, what text". The
// note author in particular is stamped from the resolved role, never from
// form data. Refusals are quiet no-ops: this is an office tool, and the pages
// only offer actions the resolved role is allowed anyway.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRepository } from "../data";
import { ADMIN_PATH } from "../auth/routing";
import { getStaffView, staffScope } from "../auth/staff-view";
import {
  clearDemoStaffView,
  setDemoStaffView,
} from "../auth/demo-staff-server";
import { ADJUDICATION_STATUSES } from "../data/repository";
import type { ClaimStatus } from "../types";

/* -------------------------------------------------------------------------- */
/* Demo staff viewer — pick / switch                                          */
/* -------------------------------------------------------------------------- */

/**
 * Choose a demo view from the /admin role picker. setDemoStaffView refuses
 * (returns false, writes nothing) when Supabase is configured, so this action
 * can never mint a staff view once real auth is live.
 */
export async function chooseDemoStaffViewAction(formData: FormData): Promise<void> {
  const role = formData.get("role");
  if (role !== "dealer" && role !== "rap_admin") return;
  const ok = await setDemoStaffView(role);
  if (!ok) return;
  revalidatePath(ADMIN_PATH, "layout");
  redirect(ADMIN_PATH);
}

/** Drop the demo view and return to the picker. */
export async function switchDemoStaffViewAction(): Promise<void> {
  await clearDemoStaffView();
  revalidatePath(ADMIN_PATH, "layout");
  redirect(ADMIN_PATH);
}

/* -------------------------------------------------------------------------- */
/* Notes — the dealer <-> RAP thread                                          */
/* -------------------------------------------------------------------------- */

export async function addStaffNoteAction(formData: FormData): Promise<void> {
  const view = await getStaffView();
  if (!view) return;

  const claimId = String(formData.get("claimId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!claimId || !body) return;

  const repo = getRepository();
  // Scope re-check: a dealer can only note claims at their own location. An
  // out-of-scope claim resolves null — same as one that doesn't exist.
  const record = await repo.getClaimRecord(staffScope(view), claimId);
  if (!record) return;

  // The author is the resolved role — NEVER whatever a form might claim.
  await repo.addClaimNote(claimId, {
    author: view.role,
    body,
    authorId: view.userId,
  });
  revalidatePath(`${ADMIN_PATH}/requests/${claimId}`);
}

/* -------------------------------------------------------------------------- */
/* The exchange sales order — the dealer's one write (review 2026-07-22)      */
/* -------------------------------------------------------------------------- */

/**
 * Record the sales order number of the in-store exchange. Dealer OR admin —
 * this is the one thing a dealer writes besides notes ("Mrs. Jones comes in
 * and exchanges; the store writes in the sales order number for the exchange,
 * and that turns it to exchange"). Scope re-checked through the repository;
 * the repository guard refuses unless RAP already authorized the exchange.
 */
export async function recordExchangeSalesOrderAction(formData: FormData): Promise<void> {
  const view = await getStaffView();
  if (!view) return;

  const claimId = String(formData.get("claimId") ?? "").trim();
  const salesOrderNumber = String(formData.get("exchangeSalesOrderNumber") ?? "").trim();
  if (!claimId || !salesOrderNumber) return;

  const repo = getRepository();
  // A dealer can only touch claims at their own location.
  const record = await repo.getClaimRecord(staffScope(view), claimId);
  if (!record) return;

  try {
    await repo.recordExchangeSalesOrder(claimId, salesOrderNumber);
  } catch {
    // Refused (not yet authorized, or a race) — the page only offers the form
    // on recordable statuses, so the re-render shows truth.
  }
  revalidatePath(`${ADMIN_PATH}/requests/${claimId}`);
  revalidatePath(ADMIN_PATH);
}

/* -------------------------------------------------------------------------- */
/* Status — RAP only ("the CRM posted back")                                  */
/* -------------------------------------------------------------------------- */

function isAdjudicationStatus(value: unknown): value is ClaimStatus {
  return ADJUDICATION_STATUSES.includes(value as ClaimStatus);
}

export async function updateStaffClaimStatusAction(formData: FormData): Promise<void> {
  const view = await getStaffView();
  // Dealers — real or demo — never adjudicate. RAP only.
  if (!view || view.role !== "rap_admin") return;

  const claimId = String(formData.get("claimId") ?? "").trim();
  const status = formData.get("status");
  if (!claimId || !isAdjudicationStatus(status)) return;

  const repo = getRepository();
  const record = await repo.getClaimRecord({ kind: "all" }, claimId);
  if (!record) return;

  try {
    await repo.updateClaimStatus(claimId, status);
  } catch {
    // A refused transition (terminal claim, or a race) — the page only offers
    // permitted moves, so there is nothing to say; the re-render shows truth.
  }
  revalidatePath(`${ADMIN_PATH}/requests/${claimId}`);
  revalidatePath(ADMIN_PATH);
}
