# Session Handoff — read this first

**Written:** 2026-07-19 · **Repo:** `c:\Newco\AI\RAP Sleep Lab\rap-sleep-lab` · **Branch:** `feature/expansion-v2`

For architecture, conventions, and the full "what's open" list, read **`docs/DEV-NOTES.md`**. This file is the *current state + immediate next actions* only.

---

## ▶ NEXT SESSION: Supabase setup

Doug is doing the Supabase connection to unblock persistence. **Runbook: `docs/SUPABASE-SETUP.md`** — follow it start to finish; it is current and re-runnable.

Three things to know going in:

1. **Two independent blockers are open** — Supabase (this) and the failed Netlify deploy (below). They are unrelated. Don't let one mask the other.
2. ~~Runbook step 7 will fail while the Netlify blocker stands~~ — **Netlify was fixed 2026-07-21**; step 7's "trigger a deploy" should now succeed.
3. **Paste the current `supabase/schema.sql`**, not an older copy — it gained a `coupons` table in `8b5174c`. A stale schema breaks the Shop coupon on the Supabase backend while it keeps working on the in-memory fallback, which is a confusing way to discover the mistake.

Everything else in the runbook (keys, seed, `claim-photos` bucket, Email provider, Site/redirect URLs, promoting `dwright@raptns.com` to `rap_admin`) is unchanged.

---

## ✅ RESOLVED 2026-07-21 — Netlify deploy blocker (history kept below)

**Fixed by fix #1: Netlify → Trigger deploy → Clear cache and deploy site.** It was the transient provider glitch. Deploys from `main` work again; production picks up `86fc1b1`+ normally. Diagnosis below kept because the middleware dead-end warning still matters.

### Diagnosed 2026-07-19 — it is NOT the code

The deploy log was read. The failure is a **Netlify↔GitHub repo-access problem**, not a build error:

```
Failed during stage 'preparing repo': Unable to access repository.
User git error while checking for ref refs/heads/main
Failing build: Failed to prepare repo
Finished processing build request in 578ms
```

It died in the **`preparing repo` stage in 578 ms** — before checkout, before `npm install`, before any compilation. No application code was ever fetched.

**Verified against the actual repo:**
- `refs/heads/main` **exists** on origin at exactly `86fc1b1` (`git ls-remote --heads origin`).
- The repo is **public**, default branch `main` — readable with zero credentials.
- So "branch deleted or renamed" is definitively ruled out. It is the Netlify GitHub App install or a transient provider glitch.

**Next action — all of it is in Doug's dashboards, nothing to change in the repo:**
1. **Netlify → Trigger deploy → Clear cache and deploy site.** Sub-second prepare-stage failures are often transient; the log shows it was building with cache. Try this first.
2. **GitHub → Settings → Applications → Netlify → Repository access** — confirm `RAP-SleepLab` is still granted. A public repo still deploys via the App install; a revoked install fails exactly this way.
3. Re-link the provider: Site configuration → Build & deploy → Continuous deployment.

### ⚠️ Dead end — do not repeat

An earlier version of this file named `middleware.ts` (the app's first middleware, which makes Netlify build an Edge Function) as prime suspect and recommended deleting it. **The log exonerates it** — the build never reached bundling. Do not delete or edit `middleware.ts` for this.

For the record, that recommendation was also wrong on its own terms. `middleware.ts` does three jobs and only one is redundant:
- **Gating** — genuinely redundant; `requireGuarantee()` in `lib/auth/app-session.ts` is authoritative on every page and server action.
- **Parking the dashboard `?token=`** — `middleware.ts:71` is the **only writer** of `PENDING_TOKEN_COOKIE`; `app/signup/page.tsx`, `app/link/page.tsx`, and `lib/actions/auth.ts:192` all read it. Deleting the middleware silently breaks purchase pre-association from dashboard deep links.
- **Supabase session refresh** — `lib/supabase/server.ts:29` swallows its cookie write with the comment *"refreshed elsewhere"*; **elsewhere is the middleware**. Server components can't set cookies, so removing it leaves no server-side refresh path and sessions die at token expiry.

If a future change ever *does* implicate the edge bundle, the fix is to strip `middleware.ts` to the token-parking job only (dropping the `@supabase/ssr` import and the `getUser()` call) and relocate the refresh — not to delete the file.

Rollback option if ever needed: `main` → `cee4086` (the last successfully deployed commit).

---

## Where things stand

| | |
|---|---|
| **Production** (`rap-sleeplab.netlify.app`) | serving `cee4086` — v1 companion + navigable shell + demo day-jumper + the fitting |
| **`main`** | `86fc1b1` (auth) — merged, **deploy failed** |
| **Branch** `feature/expansion-v2` | `86fc1b1`, clean tree |
| **Tests** | 198 passing · `npx tsc --noEmit` clean · local build green |

### Built and working
v1 companion (welcome/entry, Tonight with day-0 initial impression + nightly check-ins + tips, AI concierge with tool-use JSON→DB) · navigable shell (bottom nav: Tonight/Guarantee/Requests/Shop + Coach) · Guarantee view (eligibility + essentials + external terms link) · dealer triage · Shop · **demo day-jumper** · **the fitting** (intake → items → confirmations → photos → verify → RA + tracking number, resumable draft) · **real auth** (Supabase Auth accounts, purchase linking, role-gated `/admin`) — *auth is written and merged but not yet deployed, see blocker*.

**M5b (built 2026-07-19, commit `8b5174c`, spec `docs/SPEC-M5b.md`):** `/requests` tracking list + `/requests/[id]` detail · Shop **coupon-on-request** (unique `SLP-XXXXXX` code, 4-week expiry, idempotent, `pct` snapshotted at issue). 243 tests pass (was 198) · `tsc` clean · build green.

> ⚠️ **`supabase/schema.sql` gained a `coupons` table.** Whoever runs the Supabase setup must apply the current schema, not an earlier copy — otherwise the Shop coupon breaks on the Supabase backend while working fine on the in-memory fallback.

### Not built yet
- Full admin (approve/deny, stats, ticketing) — deliberately deferred; RAP adjudicates in its own systems.
- AI photo-coach (Claude-vision legibility check) — fast-follow after guided capture.
- PWA offline/service worker · notifications · Stripe (only a `payments` seam exists).

---

## Waiting on Doug / the RAP dev team

1. **Supabase setup — the big unblock.** Runbook: `docs/SUPABASE-SETUP.md`. Until it's done, production runs the in-memory fallback: **nothing persists** (the fitting's multi-step draft can drop between serverless requests) and **real accounts can't work** (the app falls back to light-verify). Includes enabling the Email provider, setting Site/redirect URLs, and promoting Doug's account to `rap_admin` by SQL.
2. **Hosted guarantee URL** — `GUARANTEE_META.fullTermsUrl` in `content/guarantee-terms.ts` is an `example.com` placeholder. The full terms are served from an external link (no in-app signing).
3. **Real dealer data** — contact, store URL, coupon terms (currently "Demo Bedding Co." / `SLEEPLAB20` / 20%).
4. **Confirm the fitting photo set** — law tag · model tag · foot · left · right · head · top-down, plus receipt *only* when not pre-verified from the dashboard. Asked twice, never explicitly confirmed.
5. **Turn `NEXT_PUBLIC_DEMO_MODE=false`** before launch.

**Demo credentials:** sales order **`123`**, last name **`demo`** (changed in `86fc1b1`; production still shows the old `1011099325A` / `Turnbull` until that deploy lands). Second demo guarantee: `1011099326B` / `Rivera` (~day 6).

---

## How this project is run (keep doing this)

- **The design is LOCKED** (`DESIGN.md`) — Doug's words: *"design mostly locked unless I add features."* Execute it; don't redesign. No new colors or fonts; reuse the existing component kit.
- **Master agent owns** design, scope, review, commits, and merges. **Narrow build handoffs to subagents** do the implementation, each briefed with the hard rule *"do not change the design — execute it."* This keeps Doug's token budget lean and quality controlled. Every handoff is independently verified (`tsc` + `vitest` + `next build`) and reviewed before it's committed.
- **Never treat a subagent's report as user approval.** One scoping agent fabricated "the product owner's answers"; all of it had to be re-asked. Verify claims against the code.
- **Security invariants to preserve:** anything an LLM writes must be scoped to the *verified session* (tool dispatches bind to the session's guarantee/claim; model-supplied ids are ignored — there are tests for this). `getViewer()` uses `auth.getUser()` (server-validated), not a cookie read. With auth configured, `verifyEntry` refuses so a sales order can never stand in for an account.
- Consumer-facing errors stay calm: no red validation, no "submit a request", no ticket language.

## Key documents
`DESIGN.md` · `docs/DEV-NOTES.md` (architecture + full open list) · `docs/PRD-comfort-guarantee-v1.md` · `docs/PRD-v2-expansion.md` (v2 scope + the authoritative fitting spec) · `docs/SUPABASE-SETUP.md`
