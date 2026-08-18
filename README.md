# RAP Sleep Lab

Mobile-first PWA for the RAP **90-Night Comfort Guarantee**. As of **v3** (August 2026) it ships
claims-first: a customer files an exchange request anonymously, gets a **CG###### claim number**,
and RAP agents adjudicate in their own systems and update the app dashboard by hand.

- **Spec:** `docs/SPEC-v3-simple-claims.md` (approved) · **Design (locked):** `DESIGN.md`
- **Engineering notes:** `docs/DEV-NOTES.md`

## Authoritative guarantee terms

**`docs/CMFG-90-CITY-GS.html`** is the current authoritative Limited 90-Night Comfort Guarantee
(dealer variant: City Mattress, SKU `CMFG-90-CITY-GS`), served by the app itself. The dealer may
request changes; any update replaces this file and must be reconciled against the app's encoded
rules (`lib/eligibility.ts`, `content/guarantee-terms.ts`).

Key terms:
- Exchange window: **day 31–90** after delivery (delivery date = day 0)
- One-time exchange, credit only — no refunds, no cash value
- **$199 comfort exchange fee** (`COMFORT_EXCHANGE_FEE` in `lib/eligibility.ts`) paid to the dealer
- Additional restocking fee for California King sets
- Law tag + model tag must be attached and unaltered
- Exchange happens at the selling dealer's location; the exchange authorization is issued by RAP
- Exchange credit capped at purchase price or $10,000, whichever is less

## What the app does (v3)

**Customer, no account needed**
- `/` — the claim front door: welcome, the full terms, and the identify + contact form
- `/claim` — the guided request: purchase details (with the live day-count message), qualification
  checkboxes, **optional** photos, what happens next, submit
- Submit mints a **CG###### claim number** — the single customer reference. RA and tracking numbers
  are no longer minted at submit; issuing an exchange authorization is a manual agent action.
- `/requests` — tracking, after creating an account. A claim is attached by **claim number + last
  name**; an account with nothing linked still works.
- `/guarantee` (eligibility + the linked-purchase exchange flow at `/fitting`) and `/shop`.

**Staff**
- `/admin` — the requests desk: search (name, ZIP, phone, email, order #, claim #), status and date
  filters, status transitions, staff notes, claimant detail for unlinked claims, and **claim links**
  (exchange authorization / tech report URLs). RAP sees everything; a dealer sees their location.

**Claims mode is the default.** The sleep-companion layer — `/tonight` and the Coach
(`/concierge`) — is hidden and unreachable, and the bottom nav is Guarantee · Requests · Shop. No
code was deleted: set `NEXT_PUBLIC_CLAIMS_MODE=false` to bring the whole companion product back.

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000 — runs with NO env vars (in-memory fallback)
npm test        # vitest
npm run build   # production build
```

With no Supabase keys the app uses the in-memory repository seeded from `lib/data/seed.ts`, so every
flow works offline. Demo purchase for the linked journey: sales order `123`, last name `Demo`.

## Supabase

1. Create a project and run `supabase/schema.sql` (then anything newer in `supabase/migrations/`).
2. Seed: `supabase/seed.sql`, plus the optional test data —
   `supabase/seed-test-claims.sql` (five anonymous CG claims across the lifecycle) and
   `supabase/seed-test-accounts.sql` (five staged logins: Smith day 16, Jones day 30, Osborn day 35,
   Johnson day 45, Marks day 60 — create the `*@test.com` auth users first).
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), `SUPABASE_SERVICE_ROLE_KEY` and `SESSION_SECRET`.
   No code changes — the repository switches over on its own. See `.env.example` for the rest.

## Deploy (Netlify)

Auto-deploys `main`. Build `npm run build`; the Next.js runtime handles the rest. `NEXT_PUBLIC_CLAIMS_MODE`
no longer needs to be set — claims mode is the default.

## Support placeholders

`content/support.ts` — phone **(800) 111-1110** and **comfort@raptns.com**, both placeholders until
Doug confirms. (The guarantee document itself says claims@raptns.com.)
