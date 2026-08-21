# Handoff R-6 — Guarantee and Shop reachable again

**For:** Maker 1 · **From:** master agent · **Punch list:** `misc/PUNCH-LIST-08-19.html` (R-6) · **Review:** `misc/TECHNICAL-REVIEW.html` (E-4) · **State:** `main` at `7fbb646`. R-1 to R-5 and R-8 built, tested, committed, unpushed.

**Hard rules:** design locked (`DESIGN.md`). Data through the repository layer. Rules in pure functions under `lib/` with a `.test.ts` beside them. Calm consumer copy. Done = `npx tsc --noEmit` + `npm test` + `npm run build` + `npm run test:e2e` (both suites), real output pasted.

## Where the authority comes from, exactly

**Emy**, quoted by Doug off her sheet:

> "logged in as customer, stuck on request page, would not go to guarantee nor shop"

**Doug**, twice, in both recordings:

> "She says the guarantee button doesn't work there."

> "Shop, so it hid the shop page. When I refactored it, it should keep the shop page."

That is the whole of it. Two tabs are offered and neither leads anywhere. Nobody asked for new content on either page, and nobody asked for the coupon to change hands.

## Goal

A signed-in customer with no linked purchase taps Guarantee, and lands back on Requests. Taps Shop, same. The nav offers three tabs and two of them are decoration. For the majority v3 customer, who files anonymously and only then makes an account, that is most of the app.

Make both pages render for that customer, showing what does not need a purchase and saying calmly what does.

## What is true today, verified

- **One guard does it.** `requireGuarantee()` (`lib/auth/app-session.ts:112`) redirects to `/requests` when nothing is linked. `app/(app)/guarantee/page.tsx:20` and `app/(app)/shop/page.tsx:23` both call it. `requireSignedInAllowUnlinked()` in the same file is the tolerant guard `/requests` already uses; it returns `{ session: null, guarantee: null, viewer }` when nothing is linked.
- **The middleware is not the problem.** It only answers "is anyone signed in?" for the app prefixes (`middleware.ts:139-141`); it never checks linkage. **Do not touch it.**
- **The nav decides visibility in one place.** `NAV_REQUIREMENTS` in `lib/shell.ts:104` marks `/guarantee` and `/shop` as `"linked"`, so R-1's footer already hides both tabs from an unlinked visitor. **This is the seam.** `CLAUDE.md` is explicit: change surface visibility there, never in a component.
- **What each page needs a guarantee for.** Guarantee: the day count and the eligibility engine (`evaluateEligibility` needs `guarantee.deliveryDate`), which drive the "Request an exchange" affordance. Everything else on it (the essentials list, the full-terms link, the "Something else?" link) needs nothing. Shop: `getJourney` for the day count, and `getActiveCoupon`/`getDealerLocationForGuarantee` for the dealer coupon. The catalogue itself is `SHOP_ITEMS` from `content/shop.ts`, a static file.

## Tasks

### 1. The rule

`lib/shell.ts`: `/guarantee` and `/shop` become `"signed-in"`. Leave `/tonight` and `/concierge` as `"linked"` — those are the companion layer and are hidden in claims mode anyway. Extend `lib/shell.test.ts` so an unlinked signed-in visitor is proven to be offered all three claims-mode tabs, and so an anonymous visitor is still offered none.

### 2. Both pages

Move each onto `requireSignedInAllowUnlinked()` and give each an unlinked branch.

**Guarantee, unlinked:** no day count, no eligibility, and **no "Request an exchange" button** — there is no purchase to exchange, and a disabled affordance with an eligibility message would be a lie. Keep the heading, the essentials, the full-terms link and the "Something else?" link. One guide line saying the terms are here and the purchase is not linked yet, and the existing route to link it.

**Shop, unlinked:** no day count. Render the catalogue. **No coupon**, and no offer of one: it is issued against a guarantee (`getActiveCoupon(guaranteeId)`). One line saying the dealer code comes with a linked purchase.

**Do not** move the coupon onto a claim. The punch list raises it as a question and nobody has answered it; that is a product decision, not this.

### 3. Copy

Both unlinked states need the same thing said once, in the guide's voice, with a route out: link the purchase. `/link` exists and `guardLinkRoute` lets an unlinked account in. Reuse whatever wording `/requests` already uses for the same situation (`UnlinkedHelp` in `app/(app)/requests/page.tsx`) rather than inventing a third phrasing.

### 4. Tests

**Unit**: the `lib/shell.ts` change, in `lib/shell.test.ts`, at the level the existing tests work.

**e2e**: be honest about the ceiling first. Both Playwright configs blank the Supabase env, so `isAuthConfigured()` is false and the light-verify path always resolves a guarantee — which means **the unlinked state may be unreachable in either suite**. Check before promising. If it is unreachable, say so and stop; do not build a harness.

## Out of scope

Issuing the coupon against a claim · deriving a day count from the claim's self-reported delivery date · any change to `middleware.ts`, `requireGuarantee()` or `routeAfterAuth` · `/tonight` and `/concierge` · the companion product · R-7.

## Watch for

`AppHeader` takes `session.email`, and `session` is null on the unlinked branch. `requireSignedInAllowUnlinked` returns `viewer.email` for exactly this; `/requests` already does `session?.email ?? viewer?.email ?? null`. Follow that, do not invent a second pattern.

## Report back

Files touched · what the unlinked customer now sees on each page, quoted · confirmation that a linked customer sees exactly what they saw before · test counts before and after · real command output for all four gates · whether the unlinked state is reachable in e2e, with the reasoning · `test-guide.html` gains this case.
