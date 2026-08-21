// app/api/ttc/route.ts
// R-7: the production system writes its own claim number back onto ours.
//
// Doug, on the call: "it should have two fields in there, one for an app claim
// number and one for a TTC claim number, because I'm thinking that Daniel
// should write back the TTC number to this database. Okay, yes, WE NEED TO TALK
// ABOUT THE COMMUNICATION, because AN OPTION CAN BE create an API that listens
// from here and writes the record the same way they currently do."
//
// The direction is his: they push, we listen. The contract is NOT agreed, and
// he says so in the same breath, before Daniel has been in the room. So this
// carries exactly the two fields he named, nothing more, and it is INERT until
// TTC_WRITEBACK_SECRET is set on purpose. With no secret it answers 503 and
// touches nothing. That is the default on every deployment today.
//
// THIS IS THE ONLY WRITE IN THE APP WITH NO SESSION BEHIND IT, and that is the
// point of it rather than an oversight: the caller is a system, not a person.
// A shared secret is the least this can have; whether it is ENOUGH, and whether
// this wants an IP allow-list and a rate limit, belongs to the security pass
// along with the contract conversation Doug asked for.
//
// The middleware never sees this: its matcher excludes api/ (middleware.ts).

import { NextResponse, type NextRequest } from "next/server";
import { getRepository, isSupabaseConfigured } from "../../../lib/data";
import {
  TTC_SECRET_ENV,
  authorizeTtcWriteBack,
  parseTtcWriteBack,
} from "../../../lib/ttc";

/**
 * POST /api/ttc
 *
 *   Authorization: Bearer <TTC_WRITEBACK_SECRET>     (or the bare secret)
 *   Content-Type:  application/json
 *   { "claimNumber": "CG7MKQ42", "ttcClaim": "TTC-9912" }
 *
 *   200  { "ok": true,  "claimNumber": "CG7MKQ42", "ttcClaim": "TTC-9912" }
 *   400  { "ok": false, "code": "malformed_body" | "malformed_claim_number", ... }
 *   401  { "ok": false, "code": "unauthorized", ... }
 *   404  { "ok": false, "code": "unknown_claim", ... }
 *   500  { "ok": false, "code": "backend_error", ... }
 *   501  { "ok": false, "code": "feature_off", ... }
 *
 * Every failure carries a stable `code` beside the human `error`. Switch on the
 * code, never the sentence: the sentence is for a person reading a log.
 *
 * 501, not 503, for the off state. 503 means "come back later", so an
 * integration's ordinary backoff would retry a deliberately-off endpoint for
 * ever and page somebody for a non-incident. 501 is permanent: give up and
 * tell a human. (Raised by the integration review, from the caller's seat.)
 *
 * The claim number is matched forgivingly (case-blind, CG prefix optional).
 * Anything else in the body is ignored rather than refused: a caller sending a
 * status should not fail, but nothing outside the two fields is stored.
 */
export async function POST(req: NextRequest) {
  const auth = authorizeTtcWriteBack(
    process.env[TTC_SECRET_ENV],
    req.headers.get("authorization")
  );

  // "Off" and "wrong secret" are different facts and the caller is owed the
  // difference: one is a deployment that has not enabled this, the other is a
  // credential problem on their side.
  if (auth === "not-configured") {
    return json(501, "feature_off", "TTC write-back is not switched on");
  }
  if (auth === "unauthorized") {
    return json(401, "unauthorized", "unauthorized");
  }

  // A secret says nothing about whether a real database is behind it: the two
  // switches are independent, and with Supabase unconfigured getRepository()
  // hands back the in-memory seed. Enabling write-back there would answer 200
  // for a write that lives in one warm instance's heap until it recycles, and
  // the caller would record a successful handshake for nothing. Refuse instead.
  if (!isSupabaseConfigured()) {
    return json(501, "feature_off", "TTC write-back is not switched on");
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Malformed JSON is the same answer as a body with the wrong shape.
    body = null;
  }

  const parsed = parseTtcWriteBack(body);
  if (!parsed.ok) {
    return parsed.reason === "malformed-claim-number"
      ? json(400, "malformed_claim_number", "claimNumber is not a CG number")
      : json(400, "malformed_body", "claimNumber and ttcClaim are required");
  }

  // "Could not tell" must never be reported as "does not exist". The repository
  // throws on a backend failure rather than returning null, so a timeout or a
  // key problem here answers 500 and the caller retries, instead of a 404 that
  // reads as an authoritative denial and stops them for good.
  let claim;
  try {
    claim = await getRepository().recordTtcClaim(
      parsed.claimNumber,
      parsed.ttcClaim
    );
  } catch {
    return json(500, "backend_error", "could not reach the record");
  }
  if (!claim) return json(404, "unknown_claim", "no claim with that number");

  return NextResponse.json({
    ok: true,
    claimNumber: claim.claimNumber,
    ttcClaim: claim.ttcClaim,
  });
}

/**
 * Errors carry a reason and never an echo. Nothing from the request reaches the
 * response body or a log: not the secret, not the payload, not the claim. A
 * write-back endpoint that repeats what it was sent is a way to read the
 * database one 400 at a time.
 */
function json(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}
