# Handoff R-5 — Ask whether this is a new claim or an existing one

**For:** Maker 1 (fresh session) · **From:** master agent · **Punch list:** `misc/PUNCH-LIST-08-19.html` (R-5, and read section 02 first) · **Spec:** `docs/SPEC-v3-simple-claims.md` · **State:** `main` at `e650cb8`. R-1 to R-4 are built, tested and committed, not pushed. Read the four briefs in `docs/handoffs/` and `git log --oneline -6` before touching anything.

**Hard rules:** design locked (`DESIGN.md`) — execute it, don't redesign; existing components and tokens only. Data through the repository layer, never Supabase directly. Rules live in pure functions under `lib/` with a `.test.ts` beside them. Calm consumer copy: no red, no ticket language. Do not commit or push — the master agent reviews, commits, deploys. Done = `npx tsc --noEmit` clean + `npm test` green + `npm run build` green + `npm run test:e2e` green (both suites), with the real output pasted in your report.

## Read this before the goal

The first version of this requirement was wrong, and the correction is the reason it is small. It was titled "Sign in before filing" and sized L, on the strength of a quote with an ellipsis through the middle of it. Here is the passage whole, identical in both recordings in `misc/`:

> "If I log back in as the same user, it should force me to use my account, right? … No, do not create another account. Or if you're creating a new claim, you need to be logged in." — "Right, so that's a good point. So what if I have one mattress and I return it, and I get another one, and then I have another claim, I log in as Doug Wright, **we should ask, is this a new claim or an existing one?**" — "Right? Yeah." — "Because **if** you're going to enforce account login, **then** you have to provide that option right up front."

And his own summary a moment later:

> "So sticky footer, back buttons, those few other changes, then the account management, and then **asking them if this is a new one or an existing one**."

The last sentence is a conditional. The requirement is its consequent. **Nothing about the anonymous front door changes**, and you must not change it: `docs/SPEC-v3-simple-claims.md` §1 says "No login to file", and `docs/RETAILER-EXPLAINER.html`, which is Doug's own document already in City Mattress's hands, promises "No account, no login, no receipt hunting required to get started". Both stand.

## Goal

A signed-in customer taps Exchange, and the app decides for them. If a draft is open it silently resumes it. If not, it drops into intake as though they had never been here. Neither moment ever says out loud what is about to happen, and neither offers the other option.

Ask instead.

## What is true today, verified

**One page is the entry.** `/fitting`, reached from exactly two places: the Exchange button on `/guarantee` and "Start a new request" on `/requests` (`app/(app)/guarantee/page.tsx`, `app/(app)/requests/page.tsx:230`). Both are plain `<Link href="/fitting">`.

**It resumes silently.** `app/fitting/page.tsx:68` — `const claim = await repo.getDraftClaim(guarantee.id)`, then `resumeStep({ claim, items, photos })`, else `"intake"`. The comment above it is worth reading: merely opening the page creates nothing, because the draft is born lazily inside the first server action (Emmy's ghost fix, 2026-07-23). **Do not break that.** Whatever you add must leave an untouched visit with no trace in the database.

**The customer's history is already reachable.** `listClaimsForUser(userId)` is on the interface (`lib/data/repository.ts:657`) and implemented on both backends. `/requests` already renders that list.

**Multiple purchases already work.** The account switcher was built in B-28; `lib/auth/owned-guarantees.ts` and `setActiveGuaranteeCookie` are the machinery. R-5 does not touch it, and does not need to: the question is about claims, not purchases.

**The window still gates everything.** `/fitting` returns a calm "not in your window" screen before any of this when `evaluateEligibility` says so. Your question belongs after that gate, never before it.

## Tasks

### 1. The rule

A pure function in `lib/` with a `.test.ts` beside it that answers, from a customer's claims: **is there anything to ask about, and what are the choices?**

Three outcomes, and only the last one is new UI:
- No draft and no prior claims → nothing to ask. Straight into intake, exactly as today. A first-time customer must not meet a question about history they do not have.
- A draft is open → offer to continue it, or start a new one.
- No draft, but prior claims exist → offer to start a new one, or go look at one they already sent.

Take the claims as an argument the way the eligibility engine takes dates. No I/O, no cookies, no `next/headers`.

### 2. The screen

It sits at the top of `/fitting`, before the flow renders, and it uses `ConciergeCard` and the existing buttons. Two choices at most, in the guide's voice. Something in the register of "Picking up where you left off, or is this about a different mattress?" — write it properly, that is a sketch, not copy.

Choosing "continue" renders exactly what renders today. Choosing "new" starts intake. Choosing "see the one I sent" goes to `/requests`.

**No new route, no new query parameter.** A choice that lands in the URL is a choice someone can forge or bookmark into the wrong state.

### 3. Do not create anything by asking

The ghost fix is the constraint that makes this delicate. Rendering the question must not create a draft, must not touch `updated_at`, must not write anything at all. If your implementation needs a "they chose new" signal, keep it in client state for the length of the visit. If you believe it genuinely needs to persist, stop and say so in your report rather than adding a column.

### 4. Tests

**Unit**, beside the rule: no claims at all; a draft only; prior claims only; both; a claim belonging to somebody else never appears; an empty user id. Cover the ordering the screen depends on, if the rule sorts.

**e2e**, in `e2e/claims/`, using `startAClaim` from `e2e/claims/support.ts`. Be honest about the ceiling first: both Playwright configs blank the Supabase env, so real auth cannot run there, and `/fitting` needs a linked guarantee. Look at what the in-memory seed gives you (`lib/data/seed.ts`, and the light-verify path in `lib/session.ts`) before promising a test. **If it cannot be covered without inventing a harness, say so and stop** — do not build one on spec. The unit rule carries the weight either way.

## Out of scope

Requiring a login to file anything (withdrawn; see above) · making `/guarantee` and `/shop` render for an account with nothing linked (R-6) · the customer's own description of the problem (R-8) · the account switcher for multiple purchases (built, B-28) · notifications · any change to `middleware.ts`, to `routeAfterAuth`, or to the anonymous front door at `/`.

## Watch for

The scenario Doug described is a customer on their **second purchase**: "I have one mattress and I return it, and I get another one, and then I have another claim." That customer's first guarantee has a resolved exchange, so the eligibility engine has already closed it, and the claim they are starting belongs to the *new* purchase. Check what `getDraftClaim(guarantee.id)` and `listClaimsForUser(userId)` each return in that shape before you decide which one the rule takes: they are scoped differently, one per purchase and one per account, and the difference decides whether the question is even asked.

## Report back

Files touched · the signature of the rule and why it takes what it takes · proof that rendering the question writes nothing (say how you checked) · the copy you wrote, quoted · test counts before and after · real command output (`npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:e2e`) · what remains uncovered and why · what still needs updating outside the code (`test-guide.html` gains this case) · any assumption or decision beyond this brief, called out plainly.
