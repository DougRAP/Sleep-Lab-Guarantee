// lib/actions/verify.ts
// The LIGHT-VERIFY FALLBACK front door, used only when Supabase isn't
// configured (see lib/auth/config.ts). Two paths:
//  - lookup: sales order number + last name (self-serve).
//  - token:  pre-filled-link token + last name + delivery date (from the CRM link).
// On success: set the signed session cookie and redirect to /tonight.
// On failure: return a calm message for the existing entry UI (no red).
//
// When Supabase IS configured this action refuses outright: real accounts are
// the authentication then, and a sales order number must not be a way in.

"use server";

import { redirect } from "next/navigation";
import { getRepository } from "../data";
import { setSession } from "../session";
import { isAuthConfigured } from "../auth/config";

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

const USE_ACCOUNTS =
  "Create an account to continue — it keeps your nights and your guarantee together.";

export async function verifyEntry(input: EntryInput): Promise<VerifyResult> {
  // Real auth is live: this path is closed, so a guessed sales order number
  // can never stand in for an account.
  if (isAuthConfigured()) return { ok: false, error: USE_ACCOUNTS };

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
    // Arriving on the CRM/dashboard link = the sales order is pre-verified, so
    // the fitting won't ask for a receipt photo later.
    await setSession(guarantee.id, "token");
    redirect("/tonight");
  }

  const salesOrderNumber = (input.salesOrderNumber ?? "").trim();
  if (!salesOrderNumber || !lastName) {
    return { ok: false, error: MISSING_LOOKUP };
  }
  const guarantee = await repo.verifyGuarantee({ mode: "lookup", salesOrderNumber, lastName });
  if (!guarantee) return { ok: false, error: NO_MATCH };
  // Self-serve lookup — not pre-verified, so the fitting asks for the receipt.
  await setSession(guarantee.id, "lookup");
  redirect("/tonight");
}
