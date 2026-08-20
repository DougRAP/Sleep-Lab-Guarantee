# Handoff R-4 — The account picks up the request it was made for

**For:** Maker 1 (fresh session) · **From:** master agent · **Punch list:** `misc/PUNCH-LIST-08-19.html` (R-4) · **Spec:** `docs/SPEC-v3-simple-claims.md` · **State:** `main` at `8771edb`. R-1 (app-wide footer), R-2 (the wizard's Back) and R-3 (date validation) are built, tested and committed, not pushed. Read the three briefs in `docs/handoffs/` and `git log --oneline -5` before touching anything.

**Hard rules:** design locked (`DESIGN.md`) — execute it, don't redesign; existing components and tokens only. Data through the repository layer, never Supabase directly. Rules live in pure functions under `lib/` with a `.test.ts` beside them. Calm consumer copy: no red, no ticket language. Do not commit or push — the master agent reviews, commits, deploys. Done = `npx tsc --noEmit` clean + `npm test` green + `npm run build` green + `npm run test:e2e` green (both suites), with the real output pasted in your report.

## Goal

The confirmation screen mints `CG######` and says *"Want to follow along? Create an account or log in to track your request."* They do. The request is not there.

To find it they have to go to `/requests` and type the claim number and their last name into a second form, on the same device, minutes after filing, while the app has been holding the claim's id in a cookie the whole time. Doug hit the same wall from the other side on the call:

> It doesn't recognize that I already have an account. I created one yesterday, but it let me in as if I didn't have an account.

Make the account pick the request up on its own.

## Everything you need already exists

**The claim id is in a signed cookie.** `lib/claim-session.ts`: HMAC'd, seven-day TTL, read with `getClaimSession()`. Holding it is proof this browser is the one that filed the claim, and the intake flow already trusts it that far (`lib/actions/claim.ts` resolves every write through it).

**The repository can attach a claim.** `linkClaimToUser(claimId, userId)` (`lib/data/repository.ts:664`) sets `claims.consumer_id`, is idempotent for the same user, and returns **null** when the claim already belongs to a different account. Both backends implement it.

**There is a worked example to mirror, not invent.** `linkAccount` in `lib/auth/link.ts:111` is the manual path behind the "add my claim" form on `/requests`. Read `:128-152` closely. Note what it does after the attach: when the claim carries a `guaranteeId`, it **co-links the guarantee too** (`linkGuaranteeToUser`). That matters here. An anonymous claim that auto-matched to a purchase would hand the customer their Guarantee and Shop tabs as well, which is most of what E-4 was about.

**The hook point is obvious.** `signUpAction` and `signInAction` (`lib/actions/auth.ts:79`, `:100`) both end in `redirect(await destinationAfterAuth())`. `destinationAfterAuth` resolves the viewer and routes; `routeAfterAuth` already sends a consumer with nothing linked to `/requests`, which is exactly where the freshly attached claim will be waiting. No routing change is needed.

## Tasks

### 1. The rule

Add to `lib/auth/link.ts`, beside `linkAccount`, a function that attaches the claim named by the intake session to a just-authenticated user. Take the repository and the ids as arguments the way `linkAccount` does, so it stays testable without cookies. Mirror its guards, and co-link the guarantee the same way.

**Submitted claims only.** A draft is not a filed request, and `/requests` renders a draft row that links back into the fitting to be finished (`app/(app)/requests/page.tsx:239`), which is the wrong destination for a v3 anonymous draft. Refusing drafts avoids that question entirely and matches what the confirmation screen promised. Say so in a comment.

**Never throw.** Every refusal is a quiet no-op: no claim, a draft, already someone else's, a staff account. Attaching is a courtesy the login performs, never a reason the login can fail.

### 2. Both doors

Call it from `signUpAction` and from `signInAction`, after the credential succeeds and before `destinationAfterAuth()`. Both, not just sign-up: a customer who already has an account and logs in from the confirmation screen is the same person with the same claim.

Skip it for staff. A RAP agent signing in on a machine that happens to carry a claimant cookie must not end up owning a customer's request.

### 3. Say what now happens

The confirmation screen currently promises tracking without saying the request comes along. One sentence, in the guide's register, in `components/claim/claim-flow.tsx` (`DoneScreen`). Keep it to a clause; do not add a second paragraph.

### 4. Leave the manual form alone

The "add my claim" form on `/requests` stays exactly as it is. It is the path for a different device, a cleared cookie, or a customer coming back after the seven days. R-4 makes it the exception rather than the rule; it does not replace it.

### 5. Tests

**Unit** (`lib/auth/link.test.ts`, extend it — it already covers `linkAccount` and has the fixtures). Cover: a submitted unowned claim attaches; the same call twice is idempotent; a claim owned by someone else is refused and left alone; a draft is refused; a claim id that does not exist is refused; a staff role is refused; and a claim carrying a `guaranteeId` co-links the guarantee.

**Be honest about the ceiling.** Both Playwright suites blank the Supabase env, so real auth cannot run there and **no e2e can cover this**. `lib/actions/auth.ts` has no test today because it needs the Supabase client. So the rule carries the weight: test it thoroughly, and keep the call in the two actions thin enough to read in one glance. If you find a way to cover those two call sites without inventing a Supabase mock harness, say so; do not build one on spec.

## Out of scope

Requiring a login before filing (R-5, which reverses spec v3 §1 and needs Doug) · making `/guarantee` and `/shop` render for an account with nothing linked (R-6) · the customer's own description of the problem (R-8) · notifications · any change to `routeAfterAuth` or the middleware.

## Watch for

Do not reach for the claim number. It is on screen and it is tempting to pass it through the URL, but the cookie already proves authorship and a number in a link is a number that can be edited. The seven-day TTL is the correct bound on this: after that, the manual form with the number **and** the last name is the right amount of friction.

## Report back

Files touched · the signature of the rule and why the guards are where they are · confirmation that a failure to attach can never fail a login · what the confirmation screen now says · test counts before and after, and which existing tests changed and why · real command output (`npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:e2e`) · what remains uncovered and why · what still needs updating outside the code (`test-guide.html` gains this case) · any assumption or decision beyond this brief.
