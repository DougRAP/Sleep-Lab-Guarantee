# RAP Sleep Lab — v2 Expansion (navigable app)

**Status:** scope locked · **Branch:** `feature/expansion-v2` · builds on the live comfort-companion (`main` @ 737ee9e).

Turns the linear companion into a navigable app: view the guarantee, request an exchange, track requests, get routed to the dealer for non-comfort issues, and shop accessories — with the sleep Coach anchored in the nav.

## Locked decisions
- **Fitting:** guided-first — scripted warm agent copy + labeled photo capture now; conversational agent + Claude-vision photo coach as a fast-follow.
- **Non-comfort (damage):** route to dealer (triage card). No in-app warranty/defect claim.
- **Admin/dealer:** data seam + `tracking_number` now; RAP adjudicates in existing systems; thin `/admin` later. No in-app ticketing yet.
- **Accessories:** lead-gen link-out + coupon (no Stripe now).
- **Auth (SUPERSEDED — real accounts, M6):** the password-less decision was overridden by the product owner. **Everyone creates an account (email + password) via Supabase Auth**, including arrivals from the RAP dashboard link, and logs in on return. Admin/dealer use the same auth, gated by `profiles.role`. The dashboard token only pre-associates the purchase; linking (sales order + last name) is a step an already-authenticated user performs. With no Supabase keys the app falls back to the old light-verify entry so nothing dead-ends.
- **Claims:** reuse existing `claims` + status machine; add `tracking_number`; single claim type.
- **Guarantee (#1):** full terms are served from an **EXTERNAL hosted link** (no in-app signing). In-app shows a short "essentials" summary + a "Read the full guarantee" link-out (`GUARANTEE_META.fullTermsUrl` — placeholder until Doug provides the hosted URL). Shop catalog stays a content file.
- **Coupon (#6):** generated **locally on customer request** — a unique code with a **4-week expiry**, marked "subject to dealer conditions and rules of acceptance," shown to the customer (not a static always-on code).

## Information architecture (bottom nav — see DESIGN.md "Bottom navigation")
Persistent bottom bar: **Tonight · Guarantee · Requests · Shop**, with **Coach** set apart as the guide. The fitting and admin live outside the tabs.

## The exchange "fitting" — Request exchange → claim triage (M5)
Trigger: a **"Request exchange"** button, shown/eligible day 31–90.
1. **Agent intake** — the Exchange button is what kicks off the claim. The agent (or a form when no AI key) captures, as structured JSON → DB: (a) **why** they want to exchange / *tell us about your experience*, and (b) **what they'd rather have** — describe the preferred replacement. Both go onto the RA shared with the dealer.
2. **Item(s):** enter the **model number** (from the tag on the mattress or on the receipt). Add another via a **+** button if there's more than one; **max 2 items per request**. Per item, confirm it is **not soiled, has no odors, and is not otherwise damaged**.
3. **Tap-to-confirm statements** (all required, from the 90-Night terms): mattress clean/sanitary; law tag attached; model tag attached; like-new condition; both partners present to select; within day 31–90; still the original owner; still in possession + household use only; US/original dealer.
4. **Photos (required)** (tap a labeled photo icon each): **Law tag** · **Model tag** · **5 uncovered mattress shots** (foot, both sides, head, top-down) · **Receipt photo** ONLY if the sales order was not pre-verified (didn't arrive from the dashboard).
5. **Verify:** phone (+ type) and/or email correct; mattress still at the delivery address OR capture a new address; still personally owns the mattress.
6. **Submit** → creates the exchange request and generates the **RA (Return Authorization)** — customer, item model number(s), reason/experience, preferred replacement, condition confirmations, photos, `ra_number` + `tracking_number` — **shared with the dealer** (the dealer seam) → status flow (Requests).

**Navigation / resume:** customers move freely (bottom nav) and can **resume** an in-progress exchange (saved as a draft) rather than being forced through a linear script. Plus a "skip to a different day" affordance (see the open decision below).

**Coupon mechanic (#6, built with M5):** on the Shop, a "Get your coupon" action generates a unique code locally with a 4-week expiry, shows "subject to dealer conditions and rules of acceptance," and displays it to the customer (optionally persisted for the record).

Guided-first: scripted warm copy + labeled capture now; AI agent + photo-legibility coach fast-follow. Photos → Supabase Storage (M5).

## Data additions
- `dealer_locations` (name, phone, email, site_url, coupon_code, coupon_pct) — serves dealer triage (#4) + shop coupon (#6). Seed with a placeholder dealer until real data is provided.
- `claims`: add `tracking_number`, `ra_number`, `reason_experience` (text), `preferred_replacement` (text); single-type. Exchange requests recorded here; the RA is the dealer-facing view. Support a **draft** state so an in-progress request can be resumed.
- Content files: `content/guarantee-terms.*` (the 90-Night terms) and `content/shop.*` (accessories catalog: item, blurb, link, dealer coupon).

## Build sequence
- **M4 — Navigable shell (no auth/storage):** bottom nav (#7) + Guarantee view (#1: terms + eligibility state + a Request-exchange affordance stub) + dealer triage (#4) + Shop (#6). `dealer_locations` table + seed.
- **M5 — Fitting + Tracking:** the triage flow above (#2) + Requests tracking (#3) + Supabase Storage for photos + `tracking_number`.
- **M6 — Real auth + thin admin (BUILT):** Supabase Auth for consumers, admin and dealers; account -> link -> return routing; `guarantees.consumer_id` + RLS via `auth.uid()`; a **read-only** `/admin` list. Approve/deny workflow and stats remain out of scope.

## Inputs needed
- **Guarantee terms text:** HAVE (from the signed 90-Night PDF). Restocking fee = $99 (config). Dealer-specific fields are template vars.
- **Dealer contact + store URL + coupon:** PLACEHOLDER until real data is provided.
- **Confirm the exact 5 mattress photos.**
