# Session Handoff — read this first

**Written:** 2026-07-19 · **Repo:** `c:\Newco\AI\RAP Sleep Lab\rap-sleep-lab` · **Branch:** `feature/expansion-v2`

For architecture, conventions, and the full "what's open" list, read **`docs/DEV-NOTES.md`**. This file is the *current state + immediate next actions* only.

---

## 🔴 ACTIVE BLOCKER — start here

**The auth build is merged to `main` (`86fc1b1`) but the Netlify deploy FAILED. Production is still serving the previous build (`cee4086`).**

- Production is **healthy and unbroken** — Netlify keeps the last good deploy live. Nothing is down.
- Evidence of the failure: `https://rap-sleeplab.netlify.app/login` and `/signup` return **404** (they exist only in `86fc1b1`), and the build-chunk signature never changed across ~8 minutes of polling.
- **Ruled out:** a clean local production build passes (`rm -rf .next && npm run build` → exit 0, emits Middleware 91.1 kB) with *and* without Supabase env. `middleware.ts` imports **only constants** from `lib/auth/config.ts` (pure env checks + strings) — it never pulls in `lib/session.ts`, the sole `node:crypto` user — so the edge bundle is clean.
- **Not yet known:** the actual Netlify build error. Nobody has read the deploy log.

**Next action:** get the error from **Netlify → Deploys → the failed (red) deploy → log**, then fix from evidence. Do *not* guess-fix against production.

**Prime suspect + the cheap fix:** this deploy introduced `middleware.ts` — the app's **first ever middleware**, which makes Netlify build an Edge Function. If the log implicates it, **delete `middleware.ts`**: it is only a cheap first line, and `requireGuarantee()` in `lib/auth/app-session.ts` is the authoritative gate on every page and server action. Removing it costs **nothing in security**.

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

### Not built yet
- **M5b** — `/requests` tracking list + detail, and the Shop **coupon-on-request** (unique code, 4-week expiry, "subject to dealer conditions and rules of acceptance"). This is the next feature work.
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
