# RAP Sleep Lab — Dev Team Intro

**Written 2026-07-21.** Audience: RAP dev team joining to (1) stand up Supabase and (2) fix the Netlify deploy. Demo deadline: 1–2 days.

## What this is

Customer-facing claim-intake app for the **RAP 90-Night Comfort Guarantee** program (mattress comfort-exchange, day 31–90, one-time). Customers file exchange requests from their phone; RAP's CRM adjudicates externally and posts status back into this app's database; a role-gated dealer view lets the retailer look up records and see request status.

- **Stack:** Next.js 15 (App Router) · React 19 · Supabase (auth + Postgres + RLS) · Tailwind · Vitest
- **Repo:** GitHub `RAP-SleepLab`, default branch `main`. Active work: `feature/expansion-v2`.
- **Production:** https://rap-sleeplab.netlify.app (Netlify, deploys from `main`)
- **Data seam:** app runs against Supabase when env keys are set; otherwise an in-memory seed (nothing persists). Supabase is not yet configured — that's job #1.

## Your two tasks

### 1. ~~Netlify deploy is failing~~ — RESOLVED 2026-07-21

Deploys had been failing at the *prepare-repo* stage ("Unable to access repository", ~578 ms) — a Netlify↔GitHub access glitch, not a code error. **Fixed by Netlify → Trigger deploy → Clear cache and deploy site.** Pushes to `main` now deploy normally.

If it ever recurs: same clear-cache retry first, then check GitHub → Settings → Applications → Netlify → Repository access, then re-link the provider. **Do not** touch `middleware.ts` for deploy failures; an earlier diagnosis blamed it and was wrong (details in `docs/HANDOFF.md`).

### 2. Supabase setup (the big unblock)

Follow **`docs/SUPABASE-SETUP.md`** start to finish. Until it's done, nothing persists and real accounts can't work. Three cautions:

1. Apply the **current** `supabase/schema.sql` — it recently gained a `coupons` table. A stale copy breaks the Shop coupon only on Supabase, which is confusing to trace.
2. Runbook step 7 ends in "trigger a deploy" — that step **will fail until the Netlify issue above is fixed**. That failure is expected; it is not a Supabase problem.
3. After creating auth users, roles are promoted by SQL (no UI): promote `dwright@raptns.com` to `rap_admin`, and create one **dealer** test account promoted to `role='dealer', dealer_location_id='101'`. `dealer_location_id` is free text with **no FK** — it must exactly match the seeded location `101` or the dealer dashboard silently shows nothing.

## Orientation

- **`docs/HANDOFF.md`** — current state + blockers (read first)
- **`docs/DEV-NOTES.md`** — architecture + conventions · **`DESIGN.md`** — design system (locked)
- **Roles:** `consumer | rap_admin | dealer` (`profiles.role`, RLS-enforced). Staff land on `/admin`; consumers use the app.
- **Key flows:** `/fitting` (exchange-request intake) · `/requests` (customer tracking) · `/admin` (staff/dealer list, dealer scoped to their location)
- **CRM post-back seam:** none yet — RAP status updates are direct writes to `public.claims` (RLS allows `rap_admin`; service-role key bypasses RLS). A proper `updateClaimStatus` path is being added for the demo.
- **Commands:** `npm test` (Vitest, 243 passing) · `npm run build` (includes type-check). Local: `npm run dev`.
- **Demo credentials** (in-memory seed): sales order `123` / last name `demo`; second guarantee `1011099326B` / `Rivera`.

Questions → Doug (dwright@raptns.com).
