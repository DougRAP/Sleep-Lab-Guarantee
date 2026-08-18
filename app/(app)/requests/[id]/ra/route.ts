// app/(app)/requests/[id]/ra/route.ts
// The customer's copy of their Return Authorization (Doug 2026-07-23: "yes,
// view document"). Ownership rule mirrors the request detail page: the claim
// must belong to the session's guarantee; anything else — another customer's
// claim, a draft, a claim with no RA yet — is a plain 404, indistinguishable
// from an id that doesn't exist. Same sheet as the staff copy
// (lib/ra-document.ts).

import { getRepository } from "../../../../../lib/data";
import { getAppSession } from "../../../../../lib/auth/app-session";
import { raDocumentAvailable, renderRaHtml } from "../../../../../lib/ra-document";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  const session = await getAppSession();
  if (!session) return new Response("Not found", { status: 404 });

  const repo = getRepository();
  const claim = await repo.getClaimById(id);
  if (
    !claim ||
    claim.guaranteeId !== session.guaranteeId ||
    !claim.raNumber ||
    !raDocumentAvailable(claim.status)
  ) {
    return new Response("Not found", { status: 404 });
  }

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
