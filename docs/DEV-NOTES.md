# RAP Sleep Lab — Developer Notes

**Audience:** the RAP dev team (and any engineer picking this up).
**Last updated:** 2026-08-18 · **Production:** https://rap-sleeplab.netlify.app (`main`)

---

## 0. v3 (August 2026) — read this first

The product turned. City Mattress asked for something simpler than the sleep companion, so **v3 is
claims-first**: an anonymous customer files an exchange request, gets a **CG###### claim number**,
and a RAP agent adjudicates in RAP's own systems and updates the app by hand. The spec is
**`docs/SPEC-v3-simple-claims.md`** — approved, and authoritative wherever it disagrees with the
sections below.

What that changes about everything you're about to read:

- **Claims mode is the DEFAULT** (`isClaimsMode()`, `lib/demo.ts`), no env var needed. The
  companion layer — `/tonight` and the Coach (`/concierge`) — is **hidden and unreachable**, and
  the bottom nav is Guarantee · Requests · Shop. Nothing was deleted: `NEXT_PUBLIC_CLAIMS_MODE=false`
  restores the whole companion product, coach included. Which surfaces exist per mode lives in one
  place, **`lib/shell.ts`**, and the middleware, the nav and the page guards all read it.
- **The front door is the claim.** `/` is the identify + contact form; `/claim` is the guided
  request (purchase details → qualification → optional photos → what happens next → submit).
  `/fitting` remains the exchange flow for a *linked* signed-in purchase.
- **CG###### is the only customer reference.** Submit no longer mints an RA or a tracking number —
  RA/EA issuance is a manual admin action, and `tracking_number` is retired as customer-facing.
  Pre-v3 rows keep their RA on the request detail; nothing new speaks that language.
- **Photos are optional** and never gate submission. Claims can be **unlinked** (`guarantee_id` is
  nullable) — auto-matching on (sales order # + last name) or (ZIP + last name) never blocks.
- **`RESTOCKING_FEE` is now `COMFORT_EXCHANGE_FEE`** (`lib/eligibility.ts`, $199) — §3b below is
  out of date on the name.
- **`/admin` is no longer read-only** — §8 "Planned, not built" is stale. It has search, filters,
  status transitions, staff notes, claimant detail for unlinked claims, and claim links (exchange
  authorization / tech report URLs).
- **The full terms are self-hosted** (`/comfort-guarantee.html`), so the `example.com` placeholder
  noted in §8 is resolved.

Still true from v2: the repository seam, the eligibility engine, real auth, the design lock.

Milestones M-S1…M-S5 and their handoff briefs live in `docs/handoffs/`.

---
---

## 1. What this app is

A **mobile-first PWA** that acts as a calm "better sleep" companion for someone who just bought a mattress. The **RAP 90-Night Comfort Guarantee** is embedded inside it as a **day-31–90 safety net**, not the headline.

The product spine is the guarantee's own timeline:
- **Days 0–30 (settle in):** an AI sleep concierge coaches adjustment — an initial impression on day 0–1, then nightly check-ins + tips. The exchange is *not* offered (not eligible yet).
- **Days 31–90 (safety net):** if sleep still isn't right, the **Exchange button** kicks off a claim ("the fitting").

Every night a customer adjusts successfully is an exchange RAP doesn't pay for — the incentives line up.

**Design is locked** in `DESIGN.md` (Deep Indigo Nocturne palette; Fraunces / Hanken Grotesk / Spline Sans Mono; the "living sky"; concierge as "printed light"; bottom nav). Treat it as the source of truth — execute it, don't redesign it.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 3 + CSS custom properties (`app/globals.css`) |
| Fonts | self-hosted via `next/font/google` |
| Data | Supabase (Postgres + Storage); `@supabase/ssr` |
| AI | Anthropic `@anthropic-ai/sdk` (default model `claude-sonnet-5`) |
| Tests | vitest (`npm test`) |
| Deploy | Netlify, auto-deploys `main` |

---

## 3. Architecture — the three things to understand

**a) Repository layer (`lib/data/`) — never call Supabase directly.**
`getRepository()` returns the **Supabase** implementation when `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, otherwise an **in-memory implementation** seeded from `lib/data/seed.ts`. This is why the app runs with zero configuration. Adding real Supabase keys switches it over with **no code change**.

**b) Eligibility engine (`lib/eligibility.ts`) — pure and server-authoritative.**
`journeyDay()` / `journeyPhase()` / `evaluateEligibility()`. Delivery date = **day 0**; the window is **day 31–90 inclusive**. Every decision carries citable `{ ruleId, message }` reasons so consumer copy and admin decisions trace back to a term. Constants: `WINDOW_OPEN_DAY`, `WINDOW_CLOSE_DAY`, `RESTOCKING_FEE`.

**c) Concierge (`lib/concierge.ts`, `lib/concierge-tools.ts`).**
Claude with **tool-use** converts conversation into structured JSON written to the DB (`log_nightly_check_in`, `record_initial_impression`, `note_concern`). Two things matter:
- **Session-authoritative:** `createToolDispatch(repo, guaranteeId)` closes over the *verified session's* guarantee. Tool schemas carry no id, and any id in the model's arguments is ignored — the model cannot redirect a write.
- **Graceful fallback:** with no `ANTHROPIC_API_KEY` it returns scripted, on-persona replies and **never touches the network**. Any API error degrades to the same fallback.

---

## 4. Routes

| Route | Notes |
|---|---|
| `/` | Front door. With Supabase: **create an account** (email + password) — a `?token=…` dashboard link does *not* skip this, it only pre-associates the purchase. Without Supabase: the original light-verify lookup. No nav here. |
| `/signup` · `/login` | Account creation and return. `/forgot-password` → emailed link → `/auth/callback` → `/new-password`. |
| `/link` | **After** authentication: attach the purchase (sales order + last name), or automatically from a parked dashboard token via `/auth/link-token`. |
| `/admin` | Thin, **read-only** list of exchange requests. `rap_admin` sees all; `dealer` sees only their location. Outside the nav. |
| `/tonight` | The journey home — day count, guide's line, initial impression (day 0–1) or nightly check-in, tonight's tip. |
| `/guarantee` | Eligibility state, gated **Request an exchange**, plain-language essentials, link OUT to the hosted full terms. |
| `/guarantee/help` | Dealer triage — non-comfort issues (damage/defects) route to the dealer. |
| `/requests` | Request tracking (empty state today; list/detail is M5b). |
| `/shop` | Curated accessories, link-out + coupon. |
| `/concierge` | The Coach — chat as "printed light". |
| `/fitting` | The exchange claim triage. **Focused flow — bottom nav hidden.** *(In progress, M5a.)* |

`/tonight`, `/guarantee`, `/requests`, `/shop`, `/concierge` live in the `app/(app)/` route group whose layout renders the bottom nav. The group does not affect URLs.

**Auth today (M6): real accounts.** Everyone — consumer, RAP admin, dealer — signs in with **Supabase Auth (email + password)**. Email confirmation is **off** for now.

The journey: **create an account → link the purchase → return by logging in.** A dashboard `?token=…` never bypasses account creation; the middleware parks it in a short-lived cookie and it links the purchase automatically the moment the account exists. Linking is an action an *already authenticated* user performs, so a guessed sales order number grants nothing on its own.

- **The link** is `guarantees.consumer_id` (+ `linked_via`, which drives the fitting's receipt-photo rule). Every consumer RLS policy resolves through it via `auth.uid()`.
- **The switch** is `isAuthConfigured()` (`lib/auth/config.ts`). **With no Supabase keys the app falls back to the old light-verify flow** (`lib/session.ts`) so production and the demo keep working before the keys land — the account routes hide themselves, and `verifyEntry` refuses once real auth is on.
- **The gate** every page and action shares is `requireGuarantee()` / `getAppSession()` (`lib/auth/app-session.ts`); `middleware.ts` refreshes the Supabase session and turns unauthenticated requests away before anything renders.
- **Roles** come from `profiles.role`, created for every new auth user by an `on auth.users` trigger. Promote by hand in SQL (see `supabase/schema.sql`).

---

## 5. Data model (`supabase/schema.sql`)

`profiles` (roles: `consumer` | `rap_admin` | `dealer`) · `guarantees` · `claims` · `claim_photos` · `claim_notes` · `payments` *(seam)* · `journey` · `check_ins` · `tips` · `concierge_threads` · `concierge_messages` · `concerns` · `dealer_locations`

**RLS is enabled on every table**: consumers see only their own rows, `rap_admin` sees all, dealers are scoped to their location. `SECURITY DEFINER` helpers (`is_rap_admin()`, `current_dealer_location()`) avoid recursive RLS.

Seed: `supabase/seed.sql` (and the mirrored `lib/data/seed.ts` for the in-memory fallback).

**Demo purchases:** `123` / `demo` (day 0) · `1011099326B` / `Rivera` (~day 6). With real auth on, these are what you enter at the **link** step after creating an account; without Supabase they are the light-verify login.

---

## 6. Running it

```bash
npm install
npm run dev        # http://localhost:3000 — works with NO env vars (in-memory fallback)
npm test           # vitest
npm run build      # production build
```

**Environment (`.env.example`):**

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | switches the repository to Supabase |
| `SESSION_SECRET` | **must be set in any deployed environment** (there is an insecure dev fallback) |
| `ANTHROPIC_API_KEY` | enables the live concierge + conversational structured capture |
| `ANTHROPIC_MODEL` | optional override (default `claude-sonnet-5`) |
| `NEXT_PUBLIC_DEMO_MODE` | demo day-jumper (M5a) — **turn off at launch** |
| `NEXT_PUBLIC_CLAIMS_MODE` | v3: claims mode is the **default**; set to `false` to restore the companion product |

---

## 7. Seams for the RAP dev team

1. **Supabase** — create the project, run `supabase/schema.sql` then `supabase/seed.sql`, set the three env vars in Netlify. The repository switches automatically.
2. **`SESSION_SECRET`** — set it in Netlify. Without it the app uses a known dev fallback secret.
3. **Anthropic** — set `ANTHROPIC_API_KEY` to turn the concierge from scripted to live (and enable conversational JSON→DB capture).
4. **Stripe — not built.** The `payments` table exists as a seam (`kind`: `restocking_fee` | `price_difference`). The restocking fee is a config constant (`RESTOCKING_FEE` in `lib/eligibility.ts`). Wire checkout when ready.
5. **CRM pull** — pull from Supabase. The claim / **RA record** (`ra_number`, `tracking_number`, reason, preferred replacement, items, confirmations, photos) is the handoff object shared with the dealer.

---

## 8. What is OPEN

### In progress
- **M5a** — demo day-jumper + **the fitting** (exchange triage: agent intake → items (model #, max 2, per-item condition) → confirmations → required photos → verify → submit with RA + tracking number). Resumable as a draft.
- **M5b** — `/requests` tracking (list + detail) and the Shop **coupon-on-request** (unique code, 4-week expiry, "subject to dealer conditions and rules of acceptance").

### Planned, not built
- **Admin depth.** `/admin` is a **read-only list** today (RA #, tracking #, customer, status, day). No approve/deny workflow, notes, or stats — the locked decision is "data seam now, thin admin later"; RAP adjudicates in its existing systems.
- **AI photo coach** — Claude-vision legibility check on the law/model tag shots. Guided capture ships first; this is the fast-follow.
- **PWA offline** — manifest + icon exist and it's installable; **no service worker / offline shell yet**.
- **Notifications** — no email/SMS.

### Known limitations (today, on production)
- **No Supabase keys are set in production**, so it runs the in-memory fallback: data is a read-only seed and **writes do not persist** across serverless invocations. Check-ins, chat, and requests won't stick until Supabase is wired.
- **The concierge is scripted** in production (no Anthropic key) — on-persona, but not live AI.
- **Placeholder data:** dealer is "Demo Bedding Co." (`SLEEPLAB20`, 20%); the guarantee's full-terms link points at an `example.com` placeholder.
- **Session hardening:** the light-verify signed cookie (fallback path only) has no server-side expiry check and no rate limiting. Once Supabase keys land, real auth supersedes it. **Email confirmation is off** — turn it on in Supabase before launch, and consider rate-limiting the link step.
- **ESLint is disabled during builds** (`next.config.ts`) because `eslint-config-next@15.0.0` is incompatible with Next 15.5's ESLint runner. Lint separately or bump the package.

### Decisions / inputs still needed from RAP
1. **Hosted guarantee URL** — the authoritative 90-Night document is served from an external link (no in-app signing); the app currently links to a placeholder.
2. **Real dealer** contact, store URL, and coupon terms.
3. **Confirm the fitting photo set:** law tag · model tag · foot · left side · right side · head · top-down, plus receipt *only* when the customer did not arrive pre-verified from the dashboard.
4. Whether to keep the in-app plain-language "essentials" alongside the external terms link.
5. Turn **`NEXT_PUBLIC_DEMO_MODE` off** before launch.

---

## 9. Key documents

- `DESIGN.md` — design system, voice, anti-patterns. **Source of truth; do not redesign.**
- `docs/PRD-comfort-guarantee-v1.md` — v1 companion scope.
- `docs/PRD-v2-expansion.md` — v2 scope, information architecture, and the **authoritative fitting spec**.
- `docs/SPEC-v3-simple-claims.md` — **v3 (current):** simplified claims intake. Authoritative where it disagrees with the v1/v2 docs.
- `docs/handoffs/` — the M-S1…M-S5 build briefs.

## 10. Conventions

- UI/actions go through the **repository**, never Supabase directly.
- Rules live in the **eligibility engine**, not in components.
- Anything the model writes must be **scoped to the verified session**, never to an id supplied by the model.
- New UI reuses existing components and design tokens — no new colors or fonts.
- Consumer-facing errors stay calm: no red validation, no "submit a request", no ticket language.
