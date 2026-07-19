# RAP Sleep Lab — v2 Expansion (navigable app)

**Status:** scope locked · **Branch:** `feature/expansion-v2` · builds on the live comfort-companion (`main` @ 737ee9e).

Turns the linear companion into a navigable app: view the guarantee, request an exchange, track requests, get routed to the dealer for non-comfort issues, and shop accessories — with the sleep Coach anchored in the nav.

## Locked decisions
- **Fitting:** guided-first — scripted warm agent copy + labeled photo capture now; conversational agent + Claude-vision photo coach as a fast-follow.
- **Non-comfort (damage):** route to dealer (triage card). No in-app warranty/defect claim.
- **Admin/dealer:** data seam + `tracking_number` now; RAP adjudicates in existing systems; thin `/admin` later. No in-app ticketing yet.
- **Accessories:** lead-gen link-out + coupon (no Stripe now).
- **Auth:** consumers stay password-less (signed session). Supabase Auth for admin/dealer deferred to M6 (roles + RLS already exist).
- **Claims:** reuse existing `claims` + status machine; add `tracking_number`; single claim type.
- **Content:** guarantee terms + shop catalog as versioned content files first.
- **Coupon:** static per-dealer code (default 20%); click-log later if attribution wanted.

## Information architecture (bottom nav — see DESIGN.md "Bottom navigation")
Persistent bottom bar: **Tonight · Guarantee · Requests · Shop**, with **Coach** set apart as the guide. The fitting and admin live outside the tabs.

## The exchange "fitting" — Request exchange → claim triage (M5)
Trigger: a **"Request exchange"** button, shown/eligible day 31–90.
1. **Agent intro** (friendly): asks about the experience + why they want to exchange.
2. **Tap-to-confirm statements** (all required, from the 90-Night terms): mattress clean/sanitary; law tag attached; model tag attached; like-new condition; both partners present to select; within day 31–90; still the original owner; US/original dealer.
3. **Photos** (tap a labeled photo icon each): **Law tag** · **Model tag** · **5 uncovered mattress shots** (foot, both sides, head, top-down — CONFIRM exact 5) · **Receipt photo** ONLY if the sales order was not pre-verified (didn't arrive from the dashboard).
4. **Verify:** phone (+ type) and/or email correct; mattress still at the delivery address OR capture a new address; still personally owns the mattress.
5. **Submit** → creates the exchange request + `tracking_number` → status flow (Requests).

Guided-first: scripted warm copy + labeled capture now; AI agent + photo-legibility coach fast-follow. Photos → Supabase Storage (M5).

## Data additions
- `dealer_locations` (name, phone, email, site_url, coupon_code, coupon_pct) — serves dealer triage (#4) + shop coupon (#6). Seed with a placeholder dealer until real data is provided.
- `claims`: add `tracking_number`; single-type. Exchange requests recorded here.
- Content files: `content/guarantee-terms.*` (the 90-Night terms) and `content/shop.*` (accessories catalog: item, blurb, link, dealer coupon).

## Build sequence
- **M4 — Navigable shell (no auth/storage):** bottom nav (#7) + Guarantee view (#1: terms + eligibility state + a Request-exchange affordance stub) + dealer triage (#4) + Shop (#6). `dealer_locations` table + seed.
- **M5 — Fitting + Tracking:** the triage flow above (#2) + Requests tracking (#3) + Supabase Storage for photos + `tracking_number`.
- **M6 (deferrable) — Admin + real auth:** Supabase Auth for admin/dealer; thin `/admin` queue + dealer status + stats.

## Inputs needed
- **Guarantee terms text:** HAVE (from the signed 90-Night PDF). Restocking fee = $99 (config). Dealer-specific fields are template vars.
- **Dealer contact + store URL + coupon:** PLACEHOLDER until real data is provided.
- **Confirm the exact 5 mattress photos.**
