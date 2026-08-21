# TTC write-back — the proposal to send Daniel

**Status: a proposal, not an agreement.** Doug asked for this and said, in the same breath, "we need to talk about the communication". That conversation has not happened. Nothing here is settled, and the endpoint is **switched off in every deployment** until someone sets a secret on purpose.

Send this page. Do not send the TypeScript.

---

## What it does

TTC's production system writes its own claim number onto the claim record in this app, keyed by our `CG######` number. One field, one direction: **you push, we listen.**

## Request

```
POST https://<the-site>/api/ttc
Authorization: Bearer <secret>
Content-Type: application/json

{ "claimNumber": "CG7MKQ42", "ttcClaim": "TTC-9912" }
```

- The secret may be sent as `Bearer <secret>` or bare. `Bearer` is preferred.
- `Content-Type` is not enforced, but declare `application/json`.
- `claimNumber` is matched **forgivingly**: case-blind, and the `CG` prefix is optional. `cg7mkq42` and `7MKQ42` both find `CG7MKQ42`.
- `ttcClaim` is stored as an identifier: control characters and formatting marks are stripped, and it is bounded at **200 characters**. Anything longer is truncated, and the 200 response tells you what was actually stored.
- **Any other field you send is ignored, not refused.** If you start sending a status one day, your writes will not begin failing; the field simply will not be stored until we agree on it.

## Responses

Switch on `code`, never on `error`. The sentence is for a person reading a log; the code is the contract.

| Status | `code` | What it means | What to do |
|---|---|---|---|
| 200 | — | Stored. Body carries `claimNumber` and `ttcClaim` as stored. | Done. |
| 400 | `malformed_body` | The body is not `{ claimNumber, ttcClaim }` with two non-empty strings. | Fix and do not retry. |
| 400 | `malformed_claim_number` | `claimNumber` cannot be a `CG######` at all (a space in it, wrong length, or one of the letters the alphabet excludes: **I, O, 0, 1, U**). | Fix the reference. Usually a transcription slip. |
| 401 | `unauthorized` | Wrong or missing secret. | Stop and tell a person. |
| 404 | `unknown_claim` | Well-formed, and no claim here carries it. | **Do not retry.** Quarantine and alert. |
| 500 | `backend_error` | We could not reach the record. | **Retry** with backoff. |
| 501 | `feature_off` | Not switched on in this deployment. | **Do not retry.** Tell a person. |

**501, not 503, is deliberate.** 503 means "come back later", which would have your backoff retrying a deliberately-off endpoint for ever and paging your on-call for a non-incident. 501 is permanent: give up and ask us.

`404` and `500` are now genuinely different answers. An earlier cut reported a database failure as 404, which reads as "that claim does not exist" and would have stopped your retries for the wrong reason.

## Retries

**Safe to retry the same pair.** The write is a set, not an append, and a retry carrying the value we already hold is not a write at all: we do not touch the record and the timestamp does not move. That last part matters because our agents' work queue is ordered by that timestamp, so a dead-letter replay will not reshuffle their day.

**Two of your workers posting different numbers for the same claim both get 200**, and the later one wins. There is no conflict signal. See the open questions.

## Errors never echo

No response body repeats anything you sent, and nothing is logged. That is deliberate: an endpoint that reflects its input is a way to read a database one 400 at a time. The cost to you is that a 400 does not name the offending field.

---

## Open questions, for the conversation Doug asked for

These are **not** built, on purpose. Everything above traces to something he actually said; none of the below does.

1. **"The same way they currently do."** Doug's own words about the shape of this, and nobody has looked at what TTC already runs. If it is a signed webhook, a queue drop, or anything else, the proposal above should be discarded in favour of it. **This is the first question, not the last.**
2. **Is a shared static secret the right mechanism?** One value, no rotation, no expiry, sent on every request, granting write access to every claim from anywhere. Rotating it is a hard cutover that drops in-flight writes. Alternatives worth ten minutes: an HMAC over the body with a timestamp and a nonce, two accepted secrets during a rotation window, an IP allow-list.
3. **Does the number have a shape we can validate?** If TTC numbers always look like `TTC-\d+`, saying so lets us reject anything else, which closes most of what an attacker could do with a leaked secret.
4. **A status field.** Probably wanted on both sides. Deliberately absent because it was a guess, not a request.
5. **Batching.** The first day is a backfill, not a stream. One POST per claim against an endpoint with no documented rate limit is a foot gun for both sides.
6. **Reading back.** A `GET` behind the same secret would make reconciliation possible and turn a timed-out write from an unanswerable question into a lookup. Currently out of scope.
7. **Telling you a claim is closed.** When a claim is withdrawn, denied or completed here, you have no way to know, and this endpoint will accept a write to it anyway.
8. **Rate limiting and an audit trail.** Neither exists. The app already has a rate limiter that is wired to nothing, and every other write in the app leaves an author-attributed note while this one leaves none. Both are on the security pass.

---

## Turning it on (RAP side)

1. Agree the contract above with Daniel. Until then, leave it off.
2. Generate a long random secret: `openssl rand -base64 48`.
3. Set `TTC_WRITEBACK_SECRET` **scoped to the production deploy context only.** Netlify defaults environment variables to every context, so a global value puts a live, secret-bearing copy of this endpoint on every deploy preview URL.
4. Deliver it to Daniel out of band. Not in a ticket, not in a chat thread.
5. The endpoint also refuses to run unless the Supabase variables are set. A 200 from the in-memory backend would be a successful handshake for a write that disappears at the next restart.
