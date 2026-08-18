# Handoff M-S2 — Anonymous intake flow (v3)

**For:** Maker 1 · **From:** master agent · **Spec:** `docs/SPEC-v3-simple-claims.md` §2, §3 (re-read them — §2 changed today: identify+contact are ONE form on the landing page)

**Hard rules** (unchanged): design locked — reuse the existing component kit (`components/ui/*`, `ConciergeCard` frosted cards, fitting step patterns) and tokens; no new colors/fonts. Repository layer only. Calm consumer errors — no red validation, no ticket language. Do not touch admin, coach code, or Shop. No commits/pushes. `tsc` + `vitest` + `next build` real output in the report.

## Goal

Replace the customer front door with a claim-first anonymous flow: land → identify → details (day count) → qualification checkboxes → optional photos → process explainer → submit → CG number. No account needed until post-submit tracking.

## The flow

### 1. Landing + entry form (`/` when claims-mode)
- Welcome header, then this copy (adjust grammar, keep meaning; Fraunces/voice per DESIGN.md):
  > Your purchase includes a 90-Night Comfort Guarantee. Requesting an exchange, asking advice, or getting other helpful information starts here. To get started, enter the information below. You can call us anytime at (800) 111-1110 or email comfort@raptns.com.
- Phone/email as content constants (e.g. `content/` or `lib/` config): `SUPPORT_PHONE = "(800) 111-1110"` (placeholder — Doug will supply the real number), `SUPPORT_EMAIL = "comfort@raptns.com"`.
- **"View the full 90-Night Comfort Guarantee" link** → self-host the terms: copy `docs/CMFG-90-CITY-GS.html` to `public/comfort-guarantee.html` verbatim (strip the `th:object` attribute; leave everything else), link opens in a new tab. Update `GUARANTEE_META.fullTermsUrl` in `content/guarantee-terms.ts` to `/comfort-guarantee.html`.
- **Entry form fields:**
  - Sales order number **or** delivery ZIP (present as two inputs, helper copy "either one is fine"; at least one required)
  - First name, last name (both required)
  - Email **or** mobile phone (at least one required; explain: "we'll send your exchange authorization by text or email")
- Submit → server action creates the anonymous draft claim (`createAnonymousClaim` + `updateClaim` with contact/sales order), sets the claimant session cookie, redirects into the flow.
- Keep the old flows reachable, not dead: when auth is configured, a small "Track an existing request — log in" link to `/login`. The old light-verify `Entry` and account-first `AccountForm` front doors are REPLACED on `/` in claims-mode; leave their components in place (M-S3 decides their fate).

### 2. Claimant session
- New lightweight signed cookie (own name, e.g. `rap_claim`), HMAC pattern copied from `lib/session.ts`, payload `{ claimId, iat }`, 7-day TTL. Server actions/pages for the flow resolve the draft via this cookie — `requireGuarantee()` is NOT used in this flow.
- Resume: landing form detects an existing draft cookie and offers "Continue where you left off" (same lazy-draft spirit as `currentDraft()`).

### 3. Purchase details step
- Model number, purchase date, **delivery date** (labeled "when it was delivered to you"), sales order # (only if not given at entry).
- On delivery date: compute day count (`journeyDay`, delivery = day 0) and show the state message (use `evaluateEligibility` reasons where they fit; copy drafted by you, calm voice, Doug approves):
  - **< 31:** "Day {n} — your exchange window opens on {date} (day 31)." Plus the choice (radio, required to proceed): **"Submit now and start my exchange automatically on day 31"** (`auto_submit_day_31`) or **"Have an agent call me"** (`agent_call`). Store via `earlyPreference`.
  - **31–90:** "Day {n} of your 90-night guarantee — you're in your exchange window."
  - **> 90:** calm note the 90-night window has passed; they may still submit and an agent will review; suggest calling. No blocking.

### 4. Qualification checkboxes
- Reuse the `confirmations-step` pattern + `CONFIRMATION_TERMS` (already ~matching CMFG-90-CITY-GS). Add a **protector-used** checkbox that is informational and NOT required (separate from the required set; store `protectorUsed`).
- All qualification boxes required to proceed (self-attestation; agents verify).

### 5. Photos — optional
- Reuse `photos-step` with a v3 target set: **law_tag, model_tag, top_down** required→**all optional**, plus receipt (optional). Constants live in `lib/fitting.ts` — add a v3 target list rather than editing the legacy one.
- Step copy: photos are optional and speed the review; instruct to **remove all bedding, linens, and mattress protectors** before shooting. Keep per-angle coaching lines.
- Skipping entirely is a first-class path ("I'll skip for now").

### 6. Process explainer
- New content step (frosted card list, existing components):
  1. We review your request.
  2. We may send a technician to inspect — we'll always call you first.
  3. If approved, we issue an exchange authorization by text or email.
  4. City Mattress schedules the pickup and exchange; you pay them the $199 comfort exchange fee (Cal King sets carry an added restocking fee), plus any price difference.
- Reference `COMFORT_EXCHANGE_FEE` from `lib/eligibility.ts`, don't hardcode 199 twice.

### 7. Submit + confirmation
- `submitClaim` (mints CG number, snapshots days-in-service, auto-matches — all M-S1). Pass `earlyPreference` when set.
- Confirmation screen: CG number huge and copyable; "save this number"; login/track link (`/login`); SUPPORT_EMAIL + SUPPORT_PHONE; calm next-steps recap. No RA, no tracking number anywhere in this flow.

## Routing/gating notes
- Build the flow at `/claim` (new route group or standalone like `/fitting` — no bottom nav). `/fitting` and the old flow stay untouched and reachable for authenticated guarantee sessions (M-S3 does the shell cutover; this milestone must not break the existing app).
- Landing `/` swaps to the new form **only when `NEXT_PUBLIC_CLAIMS_MODE=true`** (flag exists in `middleware.ts`); default behavior unchanged otherwise. Middleware: allow `/claim` unauthenticated in both auth worlds.

## Tests
- Entry action validation (either-or rules: order/ZIP, email/phone; trims; calm failures)
- Claimant cookie sign/verify round-trip + tamper rejection (mirror `lib/session.ts` tests)
- Day-count messages at days 5 / 31 / 90 / 91 boundaries; early_preference required only when day < 31
- v3 photo targets: nothing blocks submit
- Full-flow repository test: entry → details → confirmations → submit → CG number + auto-match cases
- Existing suites stay green.

## Report back
Usual format: files touched, test counts, real command output, assumptions/decisions.
