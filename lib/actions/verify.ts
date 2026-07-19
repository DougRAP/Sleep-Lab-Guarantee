// lib/actions/verify.ts
// Server action for the front door (PRD §3.1). Two paths:
//  - lookup: sales order number + last name (self-serve).
//  - token:  pre-filled-link token + last name + delivery date (from the CRM link).
// On success: set the signed session cookie and redirect to /tonight.
// On failure: return a calm message for the existing entry UI (no red).

"use server";

import { redirect } from "next/navigation";
import { getRepository } from "../data";
import { setSession } from "../session";

export type EntryMode = "lookup" | "token";

export interface EntryInput {
  mode: EntryMode;
  lastName: string;
  salesOrderNumber?: string;
  token?: string;
  deliveryDate?: string;
}

export type VerifyResult = { ok: false; error: string };

const NO_MATCH =
  "We couldn't find a match with those details. Give them another look and try again.";
const MISSING_LOOKUP =
  "Enter your sales order number and last name to find your purchase.";
const MISSING_TOKEN = "Please confirm both details so we know it's you.";

export async function verifyEntry(input: EntryInput): Promise<VerifyResult> {
  const repo = getRepository();
  const lastName = (input.lastName ?? "").trim();

  if (input.mode === "token") {
    const token = (input.token ?? "").trim();
    const deliveryDate = (input.deliveryDate ?? "").trim();
    if (!token || !lastName || !deliveryDate) {
      return { ok: false, error: MISSING_TOKEN };
    }
    const guarantee = await repo.verifyGuarantee({ mode: "token", token, lastName, deliveryDate });
    if (!guarantee) return { ok: false, error: NO_MATCH };
    await setSession(guarantee.id);
    redirect("/tonight");
  }

  const salesOrderNumber = (input.salesOrderNumber ?? "").trim();
  if (!salesOrderNumber || !lastName) {
    return { ok: false, error: MISSING_LOOKUP };
  }
  const guarantee = await repo.verifyGuarantee({ mode: "lookup", salesOrderNumber, lastName });
  if (!guarantee) return { ok: false, error: NO_MATCH };
  await setSession(guarantee.id);
  redirect("/tonight");
}
