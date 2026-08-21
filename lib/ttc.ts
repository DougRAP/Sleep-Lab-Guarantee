// lib/ttc.ts
// R-7: the pure half of the TTC write-back. No I/O, no request object, no
// next/headers — so it can be tested without a server and read without one.
//
// Doug, on the call, whole and with nothing elided:
//
//   "…it should have two fields in there, one for an app claim number and one
//    for a [T]TC claim number, because [I'm] thinking that Daniel should write
//    back the TTC number to this database. Okay. Yes, we need to talk about the
//    communication, because an option can be do not touch, I mean, create a
//    a[n] API that listen[s] from here and write[s] the record the same way
//    they currently do."
//
// The DIRECTION is his: they push, we listen. The CONTRACT is not agreed, and
// he says so in the same breath, before Daniel has been in the room. Building
// it anyway is ADRIAN's instruction, not an inference from that sentence; the
// honest reading of Doug alone is "wait". So this carries exactly the two
// fields he named and nothing else, and it is off until someone sets a secret
// on purpose. A status field was my own guess in the punch list ("plus, most
// likely, a status"); guesses are not contracts.
//
// One thing Doug said that nobody has examined: "the same way they currently
// do". He is pointing at an integration TTC already runs. Nothing here reuses
// it, because nobody has looked at what it is. See docs/TTC-WRITE-BACK.md.

import crypto from "crypto";
import { claimNumberQuery } from "./data/repository";

/** The env var that switches the endpoint on. Unset means it does not exist. */
export const TTC_SECRET_ENV = "TTC_WRITEBACK_SECRET";

/**
 * A TTC number is an identifier, not prose. Same bound the rest of the app puts
 * on a single line of customer input (lib/actions/claim.ts), rather than a new
 * number invented here.
 */
export const MAX_TTC_CHARS = 200;

export type TtcAuthResult = "not-configured" | "unauthorized" | "ok";

/**
 * May this caller write?
 *
 * Three states, deliberately, because "off" and "wrong password" are different
 * facts and the caller deserves to be told which. Off is the default and the
 * only honest one until the contract is agreed.
 *
 * Constant time, the same way lib/claim-session.ts compares its signature: a
 * plain === on a secret leaks its length and then its prefix, one request at a
 * time. The length check first is required, since timingSafeEqual throws on
 * mismatched buffers.
 */
export function authorizeTtcWriteBack(
  configured: string | undefined | null,
  presented: string | undefined | null
): TtcAuthResult {
  const secret = (configured ?? "").trim();
  if (!secret) return "not-configured";

  const raw = (presented ?? "").trim();
  if (!raw) return "unauthorized";

  // BOTH readings, not one. Stripping the prefix unconditionally meant a secret
  // that itself began with "Bearer " could never authenticate: the configured
  // value kept its prefix and the presented one lost it. An operator pasting a
  // whole header line out of a document would have hit exactly that, and no
  // message anywhere would have explained why.
  const candidates = raw.toLowerCase().startsWith("bearer ")
    ? [raw.slice(7).trim(), raw]
    : [raw];

  const a = Buffer.from(secret);
  for (const offered of candidates) {
    if (!offered) continue;
    const b = Buffer.from(offered);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return "ok";
  }
  return "unauthorized";
}

/**
 * Why a body was refused. A machine-readable code, because the integration
 * review was right: a caller switching on a prose sentence breaks the day
 * somebody rewords it, and one flat 400 for four different mistakes means all
 * the triage happens in their logs instead of ours.
 */
export type TtcRefusal = "malformed-body" | "malformed-claim-number";

export type TtcWriteBack =
  | { ok: false; reason: TtcRefusal }
  | { ok: true; claimNumber: string; ttcClaim: string };

/**
 * The body, or nothing.
 *
 * The claim number is passed through as sent once its SHAPE is checked: the
 * repository's claimNumberQuery already folds case and a missing CG prefix, so
 * re-doing the normalizing here would be a second rule to keep in step with the
 * first. Checking the shape is different, and it is worth doing here, so that a
 * reference which cannot be a CG number at all is the caller's 400 rather than
 * a 404 they cannot tell from a claim we have never heard of.
 *
 * Anything beyond the two fields is dropped rather than rejected. A caller
 * sending a status should not have their write fail, but it must not be stored
 * either: that field is not in the transcript and not in the contract.
 */
export function parseTtcWriteBack(body: unknown): TtcWriteBack {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "malformed-body" };
  }

  const { claimNumber, ttcClaim } = body as Record<string, unknown>;
  if (typeof claimNumber !== "string" || typeof ttcClaim !== "string") {
    return { ok: false, reason: "malformed-body" };
  }

  const number = claimNumber.trim();
  const ttc = tidyIdentifier(ttcClaim);
  if (!number || !ttc) return { ok: false, reason: "malformed-body" };

  if (!claimNumberQuery(number)) {
    return { ok: false, reason: "malformed-claim-number" };
  }

  return { ok: true, claimNumber: number, ttcClaim: ttc };
}

/**
 * A TTC number is an identifier, so it is cleaned like one.
 *
 * Two reasons, both found by review rather than imagined.
 *
 * CONTROL AND FORMAT CHARACTERS OUT. This value is rendered on the staff desk
 * as the production system's own reference, in a cell that wraps. Left alone,
 * 200 characters of newlines and right-to-left overrides put attacker-chosen
 * multi-line text in front of an agent who reads that field as fact. React
 * escapes it, so this is not an injection; it is a convincing place to write
 * "VERIFY: CALL 704-555-0148" to somebody with authority over exchanges.
 *
 * NO HALF A CHARACTER AT THE CUT. Slicing by UTF-16 unit through an emoji
 * leaves a lone surrogate, which Postgres refuses outright: the whole write
 * would fail, and the caller would be told something went wrong with their
 * number rather than with our truncation.
 */
function tidyIdentifier(value: string): string {
  const LONE_SURROGATE_AT_END = /[\uD800-\uDFFF]$/;
  return value
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .trim()
    .slice(0, MAX_TTC_CHARS)
    .replace(LONE_SURROGATE_AT_END, "")
    .trim();
}
