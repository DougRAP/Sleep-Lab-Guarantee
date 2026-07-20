// lib/actions/coupon.ts
// Server action for the shop coupon (v2 #6). Server-authoritative and scoped to
// the verified session's guarantee — the client never names a guarantee id, so a
// customer can only ever issue their own coupon.
//
// Issuing is idempotent at the repository seam, so a double-tap (or a refresh
// mid-flight) returns the code already issued rather than minting a second one.

"use server";

import { revalidatePath } from "next/cache";
import { getRepository } from "../data";
import { getAppSession } from "../auth/app-session";

export type CouponResult = { ok: true } | { ok: false; error: string };

export async function requestCoupon(): Promise<CouponResult> {
  const session = await getAppSession();
  if (!session) {
    return { ok: false, error: "Your session has ended. Please sign in again." };
  }

  await getRepository().issueCoupon(session.guaranteeId);
  revalidatePath("/shop");
  return { ok: true };
}
