# Handoff R-9 — Recognise a customer we already know

**For:** Maker 1 · **From:** master agent · **Punch list:** `misc/PUNCH-LIST-08-19.html` · **State:** `main` at `2e7f6c5`. R-1 to R-8 built, tested, committed, unpushed.

**Hard rules:** design locked (`DESIGN.md`). Data through the repository layer. Rules in pure functions under `lib/` with a `.test.ts` beside them. Calm consumer copy. Done = `npx tsc --noEmit` + `npm test` + `npm run build` + `npm run test:e2e` (both suites), real output pasted.

---

## Read this first: where this came from, and the mistake it corrects

R-5 was originally written as **"Sign in before filing"** and blocked on a decision from Doug. That was my error: I took the antecedent of a conditional and made it a requirement. R-5 was rewritten to what he actually asked for, and the invented half was withdrawn.

But one sentence never fitted either reading, and I parked it as "genuinely ambiguous":

> **"Or if you're creating a new claim, you need to be logged in."** *(cue 173 / 150)*

**Adrian solved it in session on 2026-08-21**, and his reading fits every piece of evidence where mine fitted only some: Doug is not closing the anonymous door. He is saying that **someone we already know should be taken to their own account** instead of filing as a stranger.

### The evidence, whole, in the order it was said

The thread opens with Doug's own complaint, which is also R-4's:

> "One thing, it doesn't recognize that I already have an account… I created one yesterday, but **it let me in as if I didn't have an account**, so that would just be one point to check to make sure it's doing that." *(cue 71-75 / 24-30)*

Later, on the same subject:

> "If I log back in as the same user, **it should force me to use my account**, right? … Well, if I log in as D. Doug Wright, and then I log back in again, it should force me to log back in as Doug Wright, shouldn't it?" *(cue 168-171)*
> **"No, do not create another account."** *(cue 172)*
> **"Or if you're creating a new claim, you need to be logged in."** *(cue 173)*
> "Right, so that's a good point. So what if I have one mattress and I return it, and I get another one, and then I have another claim, I log in as Doug Wright, we should ask, is this a new claim or an existing one?" *(cue 175-180)* ← **this half is R-5, built**
> "Because **if** you're going to enforce account login, **then** you have to provide that option right up front." *(cue 181-182)* ← **the conditional I misread**

And his own closing list of what to apply:

> "So sticky footer, back buttons, those few other changes, then **the account management**, and then asking them if this is a new one or an existing one." *(cue 164-167)*

"The account management" is a separate item from the asking, and this is what it is.

### Why this reading and not the other

| Evidence | This reading | "Require login for everyone" |
|---|---|---|
| cue 173, "you need to be logged in" | Yes, **when we already know you** | Yes, for everyone |
| cue 172, "do not create another account" | Same subject | Unrelated |
| cue 71-75, "it doesn't recognize that I already have an account" | The origin of the thread | Unrelated |
| `docs/SPEC-v3-simple-claims.md` §1, "**No login to file**" — committed by DougRAP on Aug 18, the day before the call | Untouched: a stranger is still asked nothing | **Reversed** |
| `docs/RETAILER-EXPLAINER.html`, "no account, no login, no receipt hunting required to get started" — also committed by DougRAP on Aug 18 | Untouched | **Broken, and the store must be told** |
| cue 164-167, "then the account management" | This, exactly | Not in his list |

Doug wrote both of those documents **the day before** and neither is in tension with this. That is the strongest single argument: this reading is the only one under which he did not contradict himself in twenty-four hours.

---

## Goal

A customer who already has an account files anonymously, and their request lands nowhere near it. Nothing on screen recognises them, and the request only joins their account if they happen to log in afterwards. Doug filed twice and the app treated him as a stranger the second time.

**Make a request from someone we already know end up on their account.**

## What is true today, verified

- **The front door knows nothing about accounts.** `lib/actions/claim.ts` never calls `getViewer`, never touches `profiles`, never asks. Filing is entirely anonymous by construction.
- **Half of Doug's complaint is already fixed, twice.** Sign-up refuses a duplicate: `lib/actions/auth.ts:55` answers *"There's already an account with that email. Log in instead, and we'll pick up where you left off."* And R-4 (`de85d43`) attaches the claim on sign-in when the account's email matches `claim.contactEmail`.
- **So what is missing is only the recognition at the moment of filing**, and the nudge that follows from it.
- **`profiles` carries both keys.** `supabase/schema.sql`: `email text` and `phone text`. `email` is written on every sign-up (`lib/auth/user.ts`); **`phone` is only ever read, never written**, so it is empty everywhere today. See "Out of scope".
- **There is no lookup by email on the repository.** `GuaranteeRepository` has nothing that finds an account. This needs a new operation, which per `CLAUDE.md` means `repository.ts`, `supabase-repository.ts` and `memory-repository.ts` in lockstep.
- **A signed-in customer cannot reach the front door.** `middleware.ts:148` redirects any signed-in visitor at `/` to the claims home. **This is the constraint that shapes the whole requirement.** Read the next section before designing anything.

## The constraint that decides the shape

"Log in first, then file" **cannot be built today**, because after logging in there is nowhere to file. The middleware bounces a signed-in customer off `/`, and no other surface starts a v3 claim. Opening that path is a second requirement, not a detail of this one.

So R-9 delivers Doug's outcome by the route that exists:

**Recognise them, tell them, and let R-4 do the rest.** The claim is filed as it is today; the confirmation screen stops saying "Create an account or log in" to somebody who plainly has one, and says the true thing instead. When they log in, R-4 attaches the request, because the address matches by definition.

If a later decision opens a filing path for signed-in customers, R-9 becomes the front-door version of the same rule with no rework. Say that in the code.

## Tasks

### 1. The rule

A pure function in `lib/` with a `.test.ts` beside it, deciding whether a contact belongs to an account we already have. Take the looked-up account as an argument, not a repository, so it stays testable without I/O — the same shape `lib/auth/link.ts` uses.

Match on email the way the rest of the app does: trimmed, case-insensitive. `lib/auth/link.ts` already has `sameEmail`; **use it rather than writing a second one**.

### 2. The repository operation

One read: find an account by email. Interface plus both backends, in lockstep. Return only what the decision needs and **nothing else** — this is a lookup keyed on an unauthenticated string, so it must not become a way to read a profile. A boolean, or an id at most.

### 3. The screen

On the confirmation screen (`DoneScreen` in `components/claim/claim-flow.tsx`), when the contact email matches an account, replace the generic invitation with one that recognises them. One sentence, the guide's register, no second paragraph. Something in the shape of *"You already have an account with this email. Log in and this request will be waiting there with the others."*

Do **not** change the entry form. Do **not** block or delay filing. A stranger's experience must be byte-identical.

### 4. Tests

**Unit**, beside the rule: matches, does not match, empty on either side, case and whitespace.

**Repository**: found, not found, empty input, and that it returns nothing beyond what task 2 allows.

**e2e**: state the ceiling honestly first. Both Playwright configs blank the Supabase env, so there are no accounts at all in either suite; check before promising, and do not build a harness. The live walkthrough (`e2e/walk/`) does have real auth and already creates an account, so it may be able to show this. Decide, do not assume.

## Out of scope

**Requiring a login before filing.** Not asked for, and it reverses two documents Doug wrote himself. See the table above.

**Recognising a phone number — that is R-10.** `profiles.phone` exists in the schema and is **never written**: `lib/auth/user.ts` reads `row.phone` and nothing ever sets it. Supabase accounts are keyed on email. So recognising by phone means first deciding where a customer's phone number comes from and keeping it current, which is a data question before it is a screen question. Doug's sentence covers it, and it is genuinely more work than email. Do not do it here.

**Opening a filing path for signed-in customers.** The constraint above. It is a real requirement and it is not this one.

**The account-existence oracle — that goes to the security review.** Telling an anonymous visitor whether an email is registered lets anyone probe addresses. Two things right-size it, and both are verified: the app **already** discloses exactly this at `/signup` (`lib/actions/auth.ts:55`), which is equally anonymous and, unlike the claim front door, carries **no rate limit at all** (`signUpAction` calls neither `enforceRateLimit` nor `guardLookupAttempt`). R-9 moves an existing disclosure to a screen that is behind the claimant cookie and the 10-per-IP claim throttle, so it is strictly better placed than the one already shipping. It is still a disclosure, and the security pass should decide the policy for both at once rather than this brief inventing one.

## Watch for

The confirmation screen is the one place the `CG` number is on display, and R-4 deliberately does not clear the claimant cookie on a failed attach so that screen stays reachable. Nothing here may change that.

And be careful what "recognised" means on screen: the customer has not proved anything at that moment. The sentence may invite them to log in; it must not imply the request is already theirs, because it is not until they do.

## Report back

Files touched · the rule's signature and why it takes what it takes · the exact sentence the recognised customer now reads, quoted · confirmation that a stranger's path is unchanged · what the repository operation returns, and why nothing more · test counts before and after · real command output for all four gates · whether the live walkthrough can show this · what still needs deciding, named.
