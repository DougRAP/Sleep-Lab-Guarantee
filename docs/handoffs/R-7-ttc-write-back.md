# Handoff R-7 — Write-back endpoint for the TTC claim number

**For:** Maker 1 · **From:** master agent · **Punch list:** `misc/PUNCH-LIST-08-19.html` (R-7) · **State:** `main` at `519b0f5`. R-1 to R-6 and R-8 built, tested, committed, unpushed.

**Hard rules:** design locked (`DESIGN.md`). Data through the repository layer. Rules in pure functions under `lib/` with a `.test.ts` beside them. Do not commit or push. Done = `npx tsc --noEmit` + `npm test` + `npm run build` + `npm run test:e2e` (both suites), real output pasted.

## Read this first: the contract is not agreed, and Doug says so

The whole passage, from `misc/ComfortSleepDoug08.srt`:

> "…it should have two fields in there, one for an app claim number and one for a [T]TC claim number, because [I'm] thinking that Daniel should write back the TTC number to this database. Okay. **Yes, we need to talk about the communication, because an option can be do not touch, I mean,** create a[n] API that listen[s] from here and write[s] the record the same way they currently do."

**Corrected after review.** The first version of this brief put `[…]` over "do not touch, I mean", which is Doug starting a thought and restarting it. The reading is unchanged, but section 02 of the punch list is a formal correction I wrote for exactly this act on R-5: "Those brackets remove the sentence that carries the meaning." A brief demanding fidelity to the transcript does not get to elide a false start it will not show the reader.

Two things follow, and they shape everything below.

**The direction IS stated.** "An API that listens from here" means we expose it and TTC calls us. So this is a push from their side into an endpoint of ours, not a read they poll. That answers the punch list's open question about direction.

**The contract is NOT agreed.** "We need to talk about the communication" and "an option can be" are Doug proposing, not deciding. Daniel has not been in the room.

So: build exactly what he described and **not one field more**, and ship it **switched off**. The endpoint must not exist until someone deliberately sets a secret. That way nothing is invented, nothing is exposed, and the day Daniel agrees the contract it is a config change plus whatever he actually needs.

**Do not add a status field.** The punch list says "one endpoint that takes a CG number and writes back the TTC number plus, **most likely**, a status". "Most likely" is my own guess and it is not in the transcript. Leave it out.

## What is true today, verified

- **Both columns already exist.** `supabase/schema.sql:142` `claim_number text unique`, `:147` `ttc_claim text`, plus the idempotent `add column if not exists` at `:228`. The schema half of Doug's request was done in M-S1.
- **Nothing can write `ttc_claim`.** `ttcClaim` is read in both repositories (`memory-repository.ts:342` seeds null, `supabase-repository.ts:153` maps the column) and set by nothing. It is absent from `UpdateClaimInput`.
- **There is no `app/api/` directory.** The only route handlers are `app/auth/callback`, `app/auth/link-token`, and the two RA documents.
- **The middleware will not get in the way.** `middleware.ts:155-160`'s matcher already excludes `api/`, so a route handler there is not behind the session gate. Verify this yourself before relying on it.
- **Constant-time comparison is already the house pattern.** `lib/claim-session.ts:58` uses `crypto.timingSafeEqual` with a length check first. Reuse it; do not hand-roll `===` on a secret.
- **Claim numbers are matched forgivingly.** `getClaimByNumber` normalizes through `claimNumberQuery` (`lib/data/repository.ts:340`), so `cg7mkq42` and `7MKQ42` find the same row. The endpoint gets that for free by going through the repository.

## Tasks

### 1. The rule

A pure module `lib/ttc.ts` with `lib/ttc.test.ts` beside it, holding what can be decided without I/O:

- **Is it switched on?** Read one env var. Absent or blank means off. Nothing else turns it on.
- **Is the caller who they say they are?** Compare the presented secret against the configured one in constant time, and refuse when either is missing.
- **Is the payload usable?** A claim number and a TTC number, both non-empty strings after trimming. Return a discriminated result, not a thrown error.

Bound the TTC number's length the way the rest of the app bounds a single line, reusing what exists rather than inventing a number.

### 2. The repository operation

`recordTtcClaim(claimNumber, ttcClaim)` on the interface, then both backends, in lockstep — `CLAUDE.md` names this explicitly. Look up by claim number so the caller never needs our internal id, return the updated claim, and return **null** when no claim carries that number. Last write wins: Doug said "writes the record", and refusing to overwrite is a rule nobody stated.

### 3. The endpoint

One route handler under `app/api/`. It:

- returns **501** when the feature is not configured, with a body that says it is not switched on. This is the default state and it must be the default state on every deployment until someone decides otherwise. *(The brief said 503. Corrected after the integration review: 503 means "come back later", so a caller's ordinary backoff would retry a deliberately-off endpoint for ever and page their on-call for a non-incident. 501 is permanent.)*
- returns **501** the same way when the Supabase variables are absent. A secret says nothing about whether a real database is behind it, and a 200 from the in-memory backend would be a successful handshake for a write that disappears at the next restart. *(Also from review; not in the first cut.)*
- returns **401** on a missing or wrong secret;
- returns **400** on an unusable payload;
- returns **404** when no claim carries that number, and **400** when the reference could not be a `CG######` at all, which is a different fact and the caller's to fix;
- returns **500**, never 404, when the backend could not be reached. A 404 reads as an authoritative denial and stops a caller's retries for good;
- returns **200** with the claim number and the stored TTC number on success.

Every failure carries a stable machine-readable `code` beside the human sentence.

Nothing else. No listing, no reading, no other verb. **Never echo the secret, the payload or the claim's contents into a log or an error body.**

### 4. Tests

**Unit**, beside the rule: switched off by default; a wrong secret refused; a missing secret refused; a valid payload accepted; whitespace-only rejected; the length bound applied.

**Repository**, in the existing repository test file for claims: writes the number, finds the claim case-insensitively, returns null for an unknown number, last write wins.

**e2e**: say plainly whether this can be covered. Both Playwright configs set their own env; check whether the feature can be switched on there before promising anything, and do not build a harness. **Blank the variable explicitly in both configs**, the way they blank the Supabase keys, or the suite is hostage to whatever sits in a developer's `.env.local`.

**The handler itself needs a test.** Its two pure halves are not the point: the composition is, because the ORDER of the guards is what makes the inertness claim true. It imports fine from a file under `lib/`.

## Out of scope

A status field, or any field beyond the TTC number · reading claims back out over HTTP · notifications · rate limiting and IP allow-listing, which belong to the security pass along with whether a shared secret is the right mechanism at all · anything that changes what the app does when the endpoint is off · R-5's remaining question.

## Watch for

The endpoint writes to a claim without any session, which is the only thing in this app that does. That is the point of it, and it is also why it ships off. Say so in the code, at the top of the handler, so nobody reads the absence of a session check as an oversight.

## Report back

Files touched · the exact request and response shapes, quoted, so Daniel can be sent them · confirmation that the endpoint is inert with no env var set, and how you proved it · test counts before and after · real command output for all four gates · what remains uncovered and why · that the contract is still unratified, stated plainly.
