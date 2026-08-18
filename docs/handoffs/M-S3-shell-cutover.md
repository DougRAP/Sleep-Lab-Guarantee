# Handoff M-S3 — Shell cutover: claims-first by default (v3)

**For:** Maker 2 (fresh session) · **From:** master agent · **Spec:** `docs/SPEC-v3-simple-claims.md` (read fully) · **State:** M-S1/M-S2/M-S4/M-S5 are built, merged, and deployed — read `git log --oneline -12` and the other briefs in `docs/handoffs/` for what exists.

**Hard rules:** design locked (`DESIGN.md`) — execute it, don't redesign; existing components/tokens only. Data through the repository layer (`lib/data/`), never Supabase directly. Rules live in the eligibility engine, not components. Calm consumer errors — no red, no ticket language. Do NOT delete coach/Tonight code — hide and disable only. Do not commit or push — the master agent reviews, commits, deploys. Done = `npx tsc --noEmit` clean + `npm test` green + `npm run build` green, real output pasted in your report.

## Goal

City Mattress wants the simple app. Make claims mode the DEFAULT, hide/disable the coach, keep Shop, and finish the v3 language cutover (CG number everywhere a customer looks; RA is staff-only).

## Tasks

### 1. Claims mode becomes the default
- Today `NEXT_PUBLIC_CLAIMS_MODE=true` opts IN (`middleware.ts`, `lib/demo.ts` or wherever `isClaimsMode()` lives — find every reader). Invert the default: claims mode ON unless `NEXT_PUBLIC_CLAIMS_MODE=false` (explicit opt-out back to the companion world). All existing claims-mode behavior follows the same switch — one function, no scattered env reads.
- Netlify env no longer needs the var set (but setting `true` stays harmless).

### 2. Coach hidden and disabled (Shop stays)
- Remove `/shop` from the claims-mode hidden set — Shop is kept (Doug).
- `/concierge` (+ its actions) disabled in claims mode: route redirects to `/guarantee`; bottom-nav Coach link gone; `/tonight`'s "Talk to your guide" link gone (whole page is hidden in claims mode anyway); admin "Coach usage →" link (`app/admin/page.tsx`) hidden in claims mode.
- Coach code, tables, tests all stay — only unreachable.

### 3. Bottom nav (claims mode)
- Tabs: **Guarantee · Requests · Shop**. (Tonight and Coach only exist in companion mode.) Keep the component shared — branch on the mode, don't fork the file.

### 4. Finish the CG cutover on the legacy fitting
- `components/fitting/submitted-step.tsx` (+ `app/fitting/page.tsx` props): submit no longer mints RA/tracking (M-S1) — the step still shows an RA stat, now empty. Lead with the **claim number** (CG######) and drop RA/tracking language from every consumer-facing fitting surface. Staff/admin RA surfaces are untouched.
- Sweep consumer surfaces for leftover "RA" / "tracking number" strings (`app/(app)/**`, `components/fitting/**`, `components/claim/**`) — claim number is the only customer reference. `grep -ri "RA number\|tracking" app components --include=*.tsx` and judge each hit.

### 5. Signed-in landing sanity (claims mode)
- `/` signed-in: linked → `/guarantee` (existing), unlinked → `/requests` (M-S5) — verify both still hold with the new default and add a routing test if none covers it.
- `/guarantee`'s "Request an exchange" keeps using `/fitting` for linked sessions (verified purchase data, receipt rule); the anonymous `/claim` flow stays for the signed-out front door. Both flows now speak CG.

### 6. Docs
- `README.md`: rewrite the feature list/quick start to the v3 reality (claims-first, CG numbers, admin, test accounts; claims mode default). Keep it short.
- `docs/DEV-NOTES.md`: add a short "v3 (August)" section at the top pointing at `docs/SPEC-v3-simple-claims.md` and correcting anything §8 now gets wrong (RESTOCKING_FEE→COMFORT_EXCHANGE_FEE note, claims-mode default, coach disabled). Don't rewrite the whole file.

### 7. Tests
- Mode default: unset env → claims mode on; `false` → off.
- Nav: claims mode shows Guarantee/Requests/Shop, no Coach/Tonight; companion mode unchanged.
- Concierge route redirect in claims mode.
- Fitting submitted-step shows CG, no RA.
- Existing suites green (routing/access-matrix tests will need the new default — update them deliberately and say so).

## Out of scope
Deleting any coach/Tonight code · admin changes beyond hiding the coach link · notifications · schema changes.

## Report back
Files touched · test counts before/after + which existing tests changed and why · real command output (tsc, test, build) · assumptions/decisions beyond the brief.
