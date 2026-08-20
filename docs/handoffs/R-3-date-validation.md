# Handoff R-3 — Dates that cannot be true (Aug 19 punch list)

**For:** Maker 1 (fresh session) · **From:** master agent · **Punch list:** `misc/PUNCH-LIST-08-19.html` (E-1 / R-3) · **Spec:** `docs/SPEC-v3-simple-claims.md` · **Design:** `DESIGN.md` · **State:** `main` at `2920290`. R-1 (app-wide footer) and R-2 (the wizard's Back) are built, tested and committed, not pushed. Read `docs/handoffs/R-1-app-wide-footer.md` and `docs/handoffs/R-2-back-control.md` and `git log --oneline -4` before touching anything.

**Hard rules:** design locked (`DESIGN.md`) — execute it, don't redesign; existing components and tokens only. Rules live in pure functions under `lib/` with a `.test.ts` beside them, never in a component. Data through the repository layer. **No red validation and no alarm language in the consumer flow** (`DESIGN.md`, "Anti-patterns"). Do not commit or push — the master agent reviews, commits, deploys. Done = `npx tsc --noEmit` clean + `npm test` green + `npm run build` green + `npm run test:e2e` green (both suites), with the real output pasted in your report.

## Goal

Emy, testing on 2026-08-19, filed a request with **purchase 08/04/2026 and delivery 07/29/2026**: delivery six days before the purchase. The app accepted it and answered *"That makes today night 21"*.

Doug, on the call, gave two rules in his own words:

> The date of the claim should not be before the delivery date.

> The other thing is, the date of delivery should not be greater than today's date.

Make those two impossible, and say so calmly when someone types them.

## The distinction that matters

v3 holds that a request is **never blocked from being submitted**: before night 31 it goes through with a preference, past night 90 it goes through with a warning, photos never gate. Nothing here changes that.

This is not a policy gate, it is a **typo guard**. A mattress cannot be delivered before it was bought, and it cannot have been delivered next Tuesday. What gets blocked is moving off the details step with a pair of dates that describe an impossible history, and the customer is told which one to look at. Every claim that could be filed before can still be filed.

## Where things stand

**Nothing validates these dates anywhere.** `lib/actions/claim.ts:190` checks only that both parse; `plainDate` (`:44`) checks only the `YYYY-MM-DD` shape. `DetailsStep` (`components/claim/claim-flow.tsx`) holds both dates in local state and compares nothing.

**The live day count is the pattern to copy.** `DetailsStep` recomputes `dayCountMessage(deliveryDate)` on every keystroke (`useMemo`, keyed on the delivery date) and renders it in a `ConciergeCard`. The same pure rule is re-applied server side in `saveClaimDetails`, so the message on screen can never disagree with the record. Your validator belongs beside it, in `lib/claim-flow.ts`, and gets used the same way in both places. `validateClaimEntry` in that file is the shape to follow for the return type.

**A future delivery date currently produces nonsense.** `journeyDay` returns a negative number, `dayCountState` reads it as "early", and the card announces something like *"That makes today night -3 — your exchange window opens on …"*. That is exactly what Emy saw a version of. The day-count card has to stand down while the pair is invalid; a correction and a night count must never be on screen together.

**The fitting is not affected.** `grep purchaseDate components/fitting/` returns nothing: `/fitting` reads its dates from the linked guarantee and never asks for them. R-3 is `/claim` only.

## Tasks

### 1. The rule, pure and tested

Add to `lib/claim-flow.ts`, next to `dayCountMessage`, a validator over the two self-reported dates with an injectable reference date, so it is testable without touching the clock. Two rules and no more:

- **Delivery is not in the future.** See the tolerance note below.
- **Purchase is not after delivery.**

A third rule for "purchase is not in the future" would be dead code: if purchase is at or before delivery, and delivery is at or before today, then purchase is already at or before today. Do not add it.

Return the same discriminated shape `validateClaimEntry` uses, so the callers read alike. When both dates are absent or malformed, return ok and let the existing "Please add both dates" message keep that job; this validator only speaks about pairs it can actually compare.

**Tolerance on the future check.** `journeyDay` normalizes to UTC midnight (`lib/eligibility.ts`), while the customer types a date in their own timezone. Someone taking delivery this morning in a zone ahead of UTC would otherwise be told their delivery is tomorrow. So block only when delivery is **more than one day** ahead of the reference date. That still catches every real typo (a wrong month, a wrong year, next week) and never punishes a same-day delivery. Say in a comment why the grace exists, or the next reader will "fix" it.

### 2. Both callers

- `saveClaimDetails` (`lib/actions/claim.ts`) re-applies it and refuses, after the presence check and before the day-count work. The server is the authority; the client is the courtesy.
- `DetailsStep` runs it live off the same two pieces of state, in the same `useMemo` style as the day count.

### 3. What the customer sees

- The correction appears in a `ConciergeCard`, the same place the night count appears, and **replaces it**: never both.
- The primary button is disabled while the pair is impossible. Precedent in this same step: the early-preference choice already disables it, and the qualification step lists what is still missing.
- **The Back button stays enabled.** A customer must always be able to leave a screen they cannot satisfy (R-2).
- Two drafts to start from, in the guide's register, no red, no "invalid", no "error":
  - *"That delivery date is still ahead of us. Mind giving it another look? Your 90 nights start the day it arrives."*
  - *"That purchase date lands after the delivery date. One of the two needs another look."*

  Copy is Doug's to approve, like the day-count messages before it (spec §7, open question 1). Draft it, do not agonise.

### 4. Belt and braces on the inputs

Give both date fields a `max`: today for the delivery date, and the delivery date (or today, when empty) for the purchase date. The browser then refuses most of these before the rule has to speak. It is not a substitute for either check above, and a customer typing rather than picking can still get past it.

### 5. Tests

**Unit** (`lib/claim-flow.test.ts`, extend it). Test the boundaries, not the middle: delivery exactly today, delivery one day ahead, delivery two days ahead, purchase equal to delivery, purchase one day after delivery, and both dates missing. Pin the reference date; do not read the real clock.

**Action** (`lib/claim-entry-action.test.ts`, extend it). It already drives the real `saveClaimDetails` with a mocked session and `vi.setSystemTime`, so add the two refusals there.

**e2e** (`e2e/claims/`, the claims-mode suite). One test that reproduces Emy's screenshot exactly: purchase `08/04/2026`, delivery `07/29/2026`. Assert the calm message appears, that **no night count is on screen**, and that the primary button is disabled. Then correct the purchase date and assert the button comes back. That last half matters as much as the first: a guard that never lets go is a worse bug than the one you are fixing.

## Out of scope

The before-night-31 and past-night-90 behaviours, which are correct and must keep submitting · `/fitting` · anything about login (R-5) · the customer's own description of the problem (R-8) · attaching a claim to an account (R-4) · any change to `journeyDay` or the eligibility engine.

## Watch for

Do not reach for the eligibility engine. `lib/eligibility.ts` decides whether a guarantee is live; this decides whether two numbers a person typed can both be true. They are different questions and the second one has no business in the terms.

## Report back

Files touched · the signature of the validator and why you chose that return shape · how the day-count card and the correction take turns on screen · test counts before and after, and which existing tests changed and why · real command output (`npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:e2e`) · the copy you drafted, flagged for Doug · what still needs updating outside the code (`test-guide-R1-R2.html` gains these cases; the punch list closes E-1) · any assumption or decision beyond this brief.
