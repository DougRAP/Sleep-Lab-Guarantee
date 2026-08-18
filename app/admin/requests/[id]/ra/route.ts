// app/admin/requests/[id]/ra/route.ts
// The Return Authorization for STAFF (review 2026-07-22). Staff-gated with the
// same scope rules as the detail page: a dealer can only open RAs for their
// own location, and an out-of-scope id is indistinguishable from one that
// doesn't exist. The sheet itself renders in lib/ra-document.ts, shared with
// the consumer's copy.

import { getRepository } from "../../../../../lib/data";
import { getStaffView, staffScope } from "../../../../../lib/auth/staff-view";
import { raDocumentAvailable, renderRaHtml } from "../../../../../lib/ra-document";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  const view = await getStaffView();
  if (!view) return new Response("Not found", { status: 404 });

  const repo = getRepository();
  const record = await repo.getClaimRecord(staffScope(view), id);
  if (!record || !record.raNumber || !raDocumentAvailable(record.status)) {
    return new Response("Not found", { status: 404 });
  }

  const claim = await repo.getClaimById(record.claimId);
  // No guarantee link (a v3 anonymous claim) → no RA sheet; and no such claim
  // ever has an RA number, so this only formalizes the record.raNumber guard.
  if (!claim?.guaranteeId) return new Response("Not found", { status: 404 });
  const [guarantee, items, dealer] = await Promise.all([
    repo.getGuaranteeById(claim.guaranteeId),
    repo.listClaimItems(claim.id),
    repo.getDealerLocationForGuarantee(claim.guaranteeId),
  ]);
  if (!guarantee) return new Response("Not found", { status: 404 });

  return new Response(
    renderRaHtml({ claim, guarantee, items, dealerName: dealer?.name ?? null }),
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}
