# Handoff R-1 — App-wide sticky footer (Aug 19 punch list)

**For:** Maker 1 (fresh session) · **From:** master agent · **Punch list:** `misc/PUNCH-LIST-08-19.html` (R-1) · **Spec:** `docs/SPEC-v3-simple-claims.md` · **Design:** `DESIGN.md` · **State:** `main` at `097256d`. Everything through M-S6 is built, merged and deployed. Nothing from the Aug 19 punch list has been built yet, so you are first. Read `git log --oneline -12` and `CLAUDE.md` before touching anything.

**Hard rules:** design locked (`DESIGN.md`) — execute it, don't redesign; existing components and tokens only, no new colors or fonts. Which surfaces exist per mode lives in `lib/shell.ts`, never in a component. Data through the repository layer (`lib/data/`), never Supabase directly. Rules live in the eligibility engine, not components. Calm consumer copy — no red, no ticket language. Do NOT delete companion code — claims mode hides, it never removes. Do not commit or push — the master agent reviews, commits, deploys. Done = `npx tsc --noEmit` clean + `npm test` green + `npm run build` green, with the real output pasted in your report.

## Goal

Doug, reviewing Emy's test sheet on 2026-08-19: *"On the request page, it has a footer. But that's not anywhere else. I'm not sure why it's not on the other pages, but you could use that footer."*

Make the bottom nav a property of the app, not of one route folder, so a customer always has chrome underfoot. Do it **without** creating new dead ends: today the bar renders three tabs regardless of whether the visitor can actually reach them, which is the root of Emy's "stuck on Requests" finding. A footer that offers a destination it then bounces you away from is worse than no footer.

## Where things stand

`<BottomNav />` is rendered by `app/(app)/layout.tsx`, so it only exists for the seven routes inside that route group. Nine routes have no footer at all, including every screen of the claim the customer actually files:

```
With footer:     /guarantee  /guarantee/help  /requests  /requests/[id]
                 /shop  /tonight  /concierge

WITHOUT footer:  /  /claim  /fitting  /login  /signup  /link
                 /forgot-password  /new-password  /admin/*
```

Two details that will bite if you miss them:

- `pb-28` on a page's `<main>` is the "there is a bar below me" reservation. Every page inside the group has it. `/` and the auth screens use `pb-10`, the claim and admin use `pb-12`. Give a page the bar without the padding and the frosted bar sits on top of the last control. `/fitting` already carries `pb-28` even though it has no bar today, so it needs no padding change.
- `components/auth/auth-shell.tsx` carries a comment saying it has no bottom nav on purpose, citing `DESIGN.md`. If auth screens end up with a footer, that comment has to change with the code.

## Tasks

### 1. Move the shell up to the root

- Render `<BottomNav />` (and `<DemoControls aboveNav />`, which already knows how to stack above it) from `app/layout.tsx` instead of `app/(app)/layout.tsx`.
- Leave the `(app)` group in place. It still exists as a grouping and other things may hang off it later; it just stops being what decides whether chrome appears.
- `BottomNav` is a client component reading `usePathname`. Keep it one component. Branch on the rule from task 2, do not fork the file.

### 2. Put the visibility rule in `lib/shell.ts`, with a guard

This is the part that matters. Add to `lib/shell.ts` a pure function that answers, for a given pathname and visitor state, **which tabs the bar should offer**. Two rules, both mandatory:

- **Surface rule.** The bar is hidden entirely on the staff desk (`/admin/**`) — those tabs are consumer destinations and a staff viewer has no journey through them. It is hidden on the signed-out auth screens (`/login`, `/signup`, `/forgot-password`, `/new-password`) for the same reason: every tab there redirects straight back to login.
- **Reachability rule.** Never render a tab the current visitor would be bounced away from. Concretely, today `/guarantee` and `/shop` call `requireGuarantee()`, which redirects to `/requests` when the account has no linked purchase. So for a signed-in account with nothing linked, those two tabs must not appear. For an anonymous visitor on `/` or `/claim`, all three tabs redirect to login, so the bar carries no tabs there at all (see task 3).

Keep the function pure and side-effect free, in the same style as `isHiddenInClaimsMode` and `navHrefs`. The caller passes the visitor state in; the function does not read cookies or env. The existing `navHrefs(claimsMode)` should end up as one input to it rather than being called directly by the component.

### 3. What the bar carries on the anonymous surfaces

On `/` and `/claim` the visitor has no session, so there are no tabs to offer. Doug's reason for wanting a footer there is navigation, and specifically the back button: *"If you have room, you could just put a footer on it. […] The back button would be an easy way to do it."*

For this brief, the anonymous bar carries the support affordance only: the phone and email from `content/support.ts`, in the bar's existing type and tokens. Nothing else. **The back control is R-2 and is deliberately not yours** — but leave the bar's layout able to take a leading slot on the left, so R-2 drops in without a redesign. Say in your report what shape you left for it.

### 4. Padding sweep

Raise the bottom padding to `pb-28` on every page that gains the bar: `app/page.tsx` (both the companion and the `ClaimLanding` branch), `app/claim/page.tsx`, and `components/auth/auth-shell.tsx` if task 2 leaves it with a bar (it should not, per the surface rule, so most likely this is just the first two). Check the `loading.tsx` files alongside them so the skeleton and the page do not disagree.

### 5. Record the design override

`DESIGN.md`, section "Bottom navigation (v2 expansion)", says the nav is **hidden during focused flows** so the fitting and entry stay full-bleed, one-breath screens. Doug is overriding that for the claim. Add a dated line to that section saying so and why, so the next person does not revert it as a regression. Keep it to two sentences; do not rewrite the section.

### 6. Tests

`lib/shell.test.ts` already covers the mode rules; extend it rather than starting a new file.

- The new function: staff paths get no bar; signed-out auth paths get no bar; anonymous `/` and `/claim` get a bar with no tabs; a signed-in linked account gets the full claims-mode set; **a signed-in unlinked account does not get Guarantee or Shop**.
- Companion mode (`NEXT_PUBLIC_CLAIMS_MODE=false`) still yields Tonight · Guarantee · Requests · Shop plus the Coach, unchanged.
- Any existing test that assumed the bar comes from the route group needs updating deliberately. Name each one you touched and why.

## Out of scope

The back button (R-2) · making `/guarantee` and `/shop` work for unlinked accounts (R-6 — this brief hides those tabs, it does not fix the pages) · any change to what the tabs are called · notifications · schema changes · anything in `app/admin/**` beyond hiding the bar.

## Watch for

The reachability rule in task 2 and the R-6 fix are two answers to the same problem, and R-6 will land after you. Write the rule so that when `/guarantee` and `/shop` learn to render for an unlinked account, the fix is to change one input to your function, not to unpick it. If you find yourself hardcoding "hide Guarantee and Shop", you have gone one step too specific.

## Report back

Files touched · the shape of the pure function you added to `lib/shell.ts` and its signature · what you left in the bar's leading slot for R-2 · test counts before and after, and which existing tests changed and why · real command output (`npx tsc --noEmit`, `npm test`, `npm run build`) · any assumption or decision you made beyond this brief.
