# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mobile-first Next.js 15 PWA for the RAP **90-Night Comfort Guarantee**, a program
administered by Risk Assurance Partners (RAP) and sold through a dealer (currently City
Mattress). As of **v3 (August 2026)** the product is **claims-first**: a customer files an
exchange request anonymously, receives a **`CG######` claim number**, and RAP agents
adjudicate in their own systems and update this app's dashboard by hand. There is no
automated approval workflow by design; the human is in the loop.

The earlier product (a "sleep companion" with nightly check-ins and an AI coach) was not
deleted. It is gated behind one flag and can be brought back.

Read `docs/SPEC-v3-simple-claims.md` first: it is authoritative wherever it disagrees with
the v1/v2 PRDs or with `docs/DEV-NOTES.md`.

## Commands

```bash
npm install
npm run dev            # http://localhost:3000, works with NO env vars (in-memory fallback)
npm test               # vitest, unit suite (lib/**/*.test.ts only)
npm run test:watch
npm run build          # production build
npm run test:e2e       # Playwright smoke, boots its own dev server on :3100
npx vitest run lib/eligibility.test.ts          # one file
npx vitest run -t "window opens on day 31"      # one test by name
npx playwright test e2e/smoke.spec.ts -g "staff search"
```

`npm run lint` exists but ESLint is disabled during builds (`next.config.ts`) because
`eslint-config-next@15.0.0` is incompatible with Next 15.5's ESLint runner. Do not treat a
green build as a lint pass.

`vitest.config.ts` only includes `lib/**/*.test.ts` in a `node` environment. There is no
component/DOM test setup: a `.test.tsx` next to a component will not run.

The Playwright config deliberately blanks every backend env var and sets
`NEXT_PUBLIC_CLAIMS_MODE=false`, so the smoke suite exercises the **companion** product
against the in-memory store. There is no e2e suite for the v3 claims flow yet.

## Two environment switches change the whole app

Nearly every "why does it behave like that?" question resolves to one of these.

1. **Backend switch.** `isSupabaseConfigured()` (`lib/data/index.ts`) checks
   `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; `isAuthConfigured()`
   (`lib/auth/config.ts`) checks the two `NEXT_PUBLIC_` vars, because it also has to run in
   edge middleware where only `NEXT_PUBLIC_*` is inlined. With keys: Supabase Postgres plus
   Supabase Auth. Without keys: an in-memory repository seeded from `lib/data/seed.ts` plus
   the legacy "light verify" signed cookie (`lib/session.ts`). Both switches are meant to
   flip together. Set all three vars or none.
2. **Product-shape switch.** `isClaimsMode()` (`lib/demo.ts`) defaults to **ON**: anything
   other than the literal string `"false"` keeps claims mode. `isDemoMode()` is its mirror
   image and defaults to **OFF** (fail-closed), because the demo day-jumper can move the
   eligibility window.

`lib/shell.ts` is the single source for which surfaces exist per mode. `middleware.ts`, the
bottom nav and the tests all read it. Change surface visibility there, never in a component.

## Architecture

**The repository seam (`lib/data/`).** UI and server code call the `GuaranteeRepository`
interface, never Supabase directly. `getRepository()` returns `SupabaseRepository` or
`MemoryRepository`. Adding a data operation means touching three files in lockstep:
`repository.ts` (interface plus input types), `supabase-repository.ts`, and
`memory-repository.ts`. The instance is cached on `globalThis`, not in a module variable,
because Next.js compiles separate module instances per server layer; a module-level
singleton gave the in-memory backend two divergent stores.

`lib/data/index.ts` is server-only (it pulls `next/headers`). Reach it from server
components and server actions, never from a client component.

**The eligibility engine (`lib/eligibility.ts`).** Pure, no I/O, server-authoritative.
Delivery date is day 0; the exchange window is day **31 to 90 inclusive**
(`WINDOW_OPEN_DAY` / `WINDOW_CLOSE_DAY`). Every decision carries a citable
`{ ruleId, message }` so consumer copy and admin decisions trace back to a written term. The
fee constant is `COMFORT_EXCHANGE_FEE` ($199); older docs call it `RESTOCKING_FEE`. Rules
belong here, not in components.

Every journey calculation accepts an injectable `referenceDate`. That is how the demo
day-jumper previews day 60 without touching a record: `lib/demo-server.ts`
`effectiveReferenceDate()` resolves it from the `rap_demo_day` cookie.

**The session gates (`lib/auth/`).** `lib/auth/routing.ts` holds the pure routing decisions
(`guardAppRoute`, `routeAfterAuth`, `homePath`) and is fully unit-tested.
`lib/auth/app-session.ts` is the runtime gate every consumer page and action shares:
- `requireGuarantee()` demands a linked purchase and redirects otherwise.
- `requireSignedInAllowUnlinked()` tolerates an account with nothing linked (v3 M-S5); use
  it for anything an anonymous claimant reaches after creating an account.

`middleware.ts` is a cheap first line only. It calls `supabase.auth.getSession()` (a local
cookie read) to answer "is anyone signed in?"; the page-level guards remain authoritative
and re-validate with `getUser()`.

**The concierge (`lib/concierge.ts`, `lib/concierge-tools.ts`).** Claude with tool-use turns
conversation into structured DB writes. Two invariants: `createToolDispatch(repo, guaranteeId)`
closes over the verified session's guarantee, and any id the model supplies is ignored; and
with no `ANTHROPIC_API_KEY` it returns scripted on-persona replies and never touches the
network. This whole layer is dormant in claims mode.

**Claim numbers and codes (`lib/ra.ts`).** `CODE_ALPHABET` excludes I/O/0/1/U because every
code here gets read aloud over the phone. `CG######` is the v3 customer reference. RA and
tracking numbers are legacy: `generateRaNumber`/`generateTrackingNumber` still exist and
pre-v3 rows still display them, but submit no longer mints either. Issuing an exchange
authorization is a manual admin action.

## Route map

Consumer routes under `app/(app)/` share a layout that renders the bottom nav; the group
does not affect URLs. Focused flows live outside it so they render full-bleed.

| Route | Notes |
|---|---|
| `/` | Claim front door: terms link plus the identify and contact form. Anonymous, no account. |
| `/claim` | The guided request (`components/claim/claim-flow.tsx`): details, qualification, optional photos, process explainer, submit. |
| `/requests`, `/requests/[id]` | Post-submit tracking. Attach a claim by claim number plus last name. Tolerates an unlinked account. |
| `/guarantee`, `/shop` | Require a **linked** guarantee (`requireGuarantee()`). |
| `/fitting` | The older exchange flow for a linked signed-in purchase. Outside the nav group. |
| `/admin`, `/admin/requests/[id]` | Staff desk. `rap_admin` sees everything, `dealer` is scoped to their location. |
| `/tonight`, `/concierge` | Companion layer. Hidden **and** redirected in claims mode. |

## Data model

`supabase/schema.sql` is the base; anything newer lives in `supabase/migrations/`. Apply the
base file, then the migrations in filename order. `lib/data/seed.ts` mirrors `supabase/seed.sql`
for the in-memory backend; when you change one, change the other or the two backends drift.

`claims.guarantee_id` is **nullable**: an anonymous claim that auto-matching could not resolve
is a valid, expected state, and matching never blocks submission. Any code reading a claim
must handle a null guarantee.

RLS is enabled on every table, with `SECURITY DEFINER` helpers (`is_rap_admin()`,
`current_dealer_location()`) to avoid recursive policies. New tables in `public` also need
explicit Data API grants; follow the pattern in
`supabase/migrations/20260728140000_explicit_data_api_grants.sql`.

## Conventions

- Data access goes through the repository. Rules go through the eligibility engine.
- Anything the AI writes is scoped to the verified session, never to an id the model supplied.
- Reuse existing components and design tokens. `DESIGN.md` is locked: execute it, do not
  redesign it. No new colors or fonts.
- Consumer-facing copy stays calm: no red validation, no "submit a request", no ticket or
  claims-desk language. The concierge speaks in the serif voice.
- Prefer adding a pure function in `lib/` with a `.test.ts` beside it over logic in a
  component. That is why 550-plus unit tests exist and why `lib/actions/*` (which need
  `next/headers`) are thin wrappers over tested pure helpers.

## Documents

`docs/SPEC-v3-simple-claims.md` (current, authoritative) · `DESIGN.md` (locked design system)
· `docs/DEV-NOTES.md` (engineering orientation; section 0 flags what the rest is stale about)
· `docs/CMFG-90-CITY-GS.html` (the authoritative guarantee terms, also served at
`/comfort-guarantee.html`) · `docs/handoffs/` (the M-S1 to M-S6 build briefs) ·
`docs/PRD-v2-expansion.md` (the fitting spec) · `docs/SUPABASE-SETUP.md`.

`content/support.ts` is the single source for the support phone and email. Do not hardcode
either anywhere else.
