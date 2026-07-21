// lib/auth/staff-view.ts
// One resolution for "who is looking at the staff surfaces?" — shared by
// /admin, /admin/requests/[id], and every staff server action, so the answer
// can never differ between a page and the action it posts to.
//
// Two mutually exclusive sources, and the REAL one always wins:
//   Supabase configured  -> guardAdminRoute + getViewer(), exactly the path
//                           /admin has always used. The demo cookie is never
//                           read on this branch (and getDemoStaffView refuses
//                           on its own anyway — belt and braces).
//   Supabase absent      -> the demo staff cookie (lib/auth/demo-staff.ts),
//                           hard-scoped to the two canned demo views.
//
// Server-only (pulls next/headers through getViewer / the cookie reader).

import { getRepository } from "../data";
import { isAuthConfigured } from "./config";
import { getViewer } from "./user";
import { guardAdminRoute, isStaff } from "./routing";
import { getDemoStaffView } from "./demo-staff-server";
import type { ClaimRecordScope } from "../data/repository";

/** The resolved staff viewer, real or demo. */
export interface StaffView {
  role: "rap_admin" | "dealer";
  dealerLocationId: string | null;
  /** True when this view comes from the demo cookie (Supabase unconfigured). */
  demo: boolean;
  /** The real auth user id; null on the demo fallback. */
  userId: string | null;
}

export type StaffResolution =
  /** A staff view is live — render the desk. */
  | { kind: "staff"; view: StaffView }
  /** The real-auth guard says this visitor belongs elsewhere. */
  | { kind: "redirect"; to: string }
  /** Unconfigured and no demo view chosen yet — show the role picker. */
  | { kind: "picker" };

/**
 * The data scope a staff view is allowed. Mirrors the rule /admin has always
 * applied: a dealer with a location is scoped to it; RAP sees everything.
 */
export function staffScope(view: StaffView): ClaimRecordScope {
  return view.role === "dealer" && view.dealerLocationId
    ? { kind: "dealer_location", dealerLocationId: view.dealerLocationId }
    : { kind: "all" };
}

/** Resolution for the staff PAGES. Pages act on redirect/picker themselves. */
export async function resolveStaffView(): Promise<StaffResolution> {
  // --- Real auth: the untouched guardAdminRoute + getViewer path ---
  if (isAuthConfigured()) {
    const viewer = await getViewer();
    const linked = viewer
      ? Boolean(await getRepository().getGuaranteeForUser(viewer.userId))
      : false;
    const to = guardAdminRoute({
      authConfigured: true,
      authenticated: Boolean(viewer),
      linked,
      role: viewer?.role ?? null,
      hasLightSession: false,
    });
    if (to) return { kind: "redirect", to };
    // The guard only passes an authenticated staff viewer; this narrows types.
    if (!viewer || !isStaff(viewer.role) || viewer.role === "consumer") {
      return { kind: "redirect", to: "/" };
    }
    return {
      kind: "staff",
      view: {
        role: viewer.role,
        dealerLocationId: viewer.dealerLocationId,
        demo: false,
        userId: viewer.userId,
      },
    };
  }

  // --- Fallback: the demo staff viewer (refuses on its own when configured) ---
  const demo = await getDemoStaffView();
  if (!demo) return { kind: "picker" };
  return {
    kind: "staff",
    view: {
      role: demo.role,
      dealerLocationId: demo.dealerLocationId,
      demo: true,
      userId: null,
    },
  };
}

/**
 * Resolution for staff SERVER ACTIONS: the same answer, without navigation —
 * an action refuses with a quiet no-op rather than throwing a redirect.
 */
export async function getStaffView(): Promise<StaffView | null> {
  const resolved = await resolveStaffView();
  return resolved.kind === "staff" ? resolved.view : null;
}
