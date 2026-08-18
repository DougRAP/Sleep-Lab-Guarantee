# Handoff M-S5 — Tracking, relaxed linking, unlinked accounts (v3)

**For:** Maker 1 · **From:** master agent · **Spec:** `docs/SPEC-v3-simple-claims.md` §3, milestone M-S5
**Driver (Doug, 2026-08-18, testing live):** a user may not have their sales order number — let them link by ZIP instead; and if we can't find a record, **let them proceed anyway**.

**Hard rules** (unchanged): design locked, existing kit only. Repository layer only. Calm consumer errors. No commits/pushes. Real `tsc`/`vitest`/`next build` output.

**Context since M-S2:** master committed `dc7b49c` (accept `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as the anon key — read the diff in `lib/auth/config.ts`, `middleware.ts`, `lib/supabase/*`). Production now has real Supabase auth live.

## Goal

An account exists to **track requests**. Users must be able to: link their purchase by sales order OR delivery ZIP; link their claim by CG number; or link nothing at all and still get in.

## Tasks

### 1. Relax `/link` (purchase linking)
- `components/auth/link-purchase-form.tsx` + the linking action in `lib/actions/auth.ts`:
  - Fields: sales order number **or** delivery ZIP ("either one is fine"), last name (required).
  - Resolution: reuse the `matchGuarantee` two-key rule ((order + last name) else (ZIP + last name)), **unique match only** → `linkGuaranteeToUser`. Ambiguous or no match → calm copy ("We couldn't find it — you can continue and we'll connect it later.") and show:
  - **"Continue anyway"** — proceeds signed-in with no linked guarantee (no fake rows; just no link).
- Also accept a **claim number (CG######)** in the same form (third way to identify): `getClaimByNumber` + last-name check → link that CLAIM to the account (new `linkClaimToUser` repo method setting `claims.consumer_id`; also link the claim's guarantee to the user when the claim has one).

### 2. Unlinked accounts must not dead-end
- `requireGuarantee()` (`lib/auth/app-session.ts`) currently redirects no-guarantee users to `/link` forever. Add a tolerant variant (e.g. `getAppSessionAllowUnlinked()` or an options flag) used by the pages below; keep the strict gate for guarantee-dependent pages (`/tonight`, `/guarantee`, `/fitting`).
- `/requests` becomes the signed-in home for unlinked users:
  - Lists claims where `consumer_id = user` (works with zero guarantees).
  - Empty state offers: "Have a claim number? Add it here" (CG + last name, same linking action) + link to `/link` for purchase linking + support contacts (`content/support.ts`).
- Routing: after login/signup with nothing linked → `/requests` (not a `/link` bounce). `/link` stays reachable, is skippable ("Continue anyway" → `/requests`), and never loops.
- Claims-mode middleware: signed-in users redirected away from `/` land on `/requests` when they have no guarantee (today's target `/guarantee` hard-requires one).

### 3. Consumer claim detail parity (small)
- `/requests/[id]` for a v3 claim: show CG number, status in consumer words, day count, support contacts. No RA/tracking language for v3 claims. (Reuse the existing detail page; add the CG fields.)

### 4. Tests
- Link action: order-key, ZIP-key, ambiguous→no link + calm copy, continue-anyway path.
- CG linking: right/wrong last name; claim's guarantee co-linked when present.
- Unlinked session: `/requests` renders, strict pages still redirect.
- Existing suites green.

## Out of scope
Shell/nav cutover + coach disable (M-S3, next) · notifications · admin changes.

## Report back
Usual format.
