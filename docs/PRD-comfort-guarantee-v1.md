# RAP 90-Night Comfort Guarantee — Claim Intake App (v1 PRD)

**Status:** locked for build · **Branch:** `rebuild/comfort-guarantee-v1`
**Owner:** Doug Wright (RAP) · Master agent: Claude

## 1. What this is
A mobile-first PWA that is a **calm, premium "better sleep" companion** for someone who just bought a mattress, guided by a novel **AI sleep concierge**. The 90-Night Comfort Guarantee lives *inside* it as a safety net, not the headline. It also includes an admin surface for RAP to review/approve exchange requests and for the Dealer to see authorized exchanges and mark them completed.

Rebuilds the best of two prototypes: **Grok's** correct comfort-guarantee domain model + AI-agent idea + **old Claude app's** design system, guided photo capture, and server-authoritative rules engine. Design source of truth: `DESIGN.md` (Deep Indigo Nocturne; Fraunces / Hanken Grotesk / Spline Sans Mono; the "living sky" + concierge-as-printed-light + "the fitting").

**In scope:** the 90-night mattress *comfort* guarantee + the sleep-companion spine (below). Not warranty/defect claims. Not the furniture program. Not a full sleep-tracking platform (v2+).

## 2. Locked decisions
| Decision | Choice |
|---|---|
| Consumer access | Pre-filled link from CRM carrying guarantee/sales-order ref + light identity verify (last name + delivery date). No passwords. |
| Photo capture | Live guided camera **with AI coaching** (Claude vision) to check law-tag/model-label legibility. Graceful fallback if no API key. |
| Admin/dealer | RAP admin reviews → approve/deny → issues RA#; Dealer sees authorized exchanges + marks completed. Roles + RLS. (No full dealer portal in v1.) |
| Payments | Build the payment **step + data seam** only. RAP dev team wires Stripe (restocking fee + price difference). |
| Stack | Keep Grok's: Next.js 15 App Router, React 19, TypeScript, Tailwind. Supabase (DB + Auth + Storage). Netlify deploy. |

## 2a. Product spine — the 90-day sleep journey
The guarantee recommends a 4–6 week adjustment period and only allows exchange **day 31–90**. So the app's spine is that journey, not a claim form:
- **Days 0–30 (Settle in):** the concierge coaches adjustment. Nightly/most-nights **check-in** ("how did last night feel?" better / same / rougher) + a tunable **tip** matched to time-of-day and journey-day. Exchange is not offered yet (not eligible). Goal: help them adjust — every success is an exchange RAP doesn't pay for.
- **Day 31–90 (Safety net):** if they're still not sleeping well, the concierge surfaces **"the fitting"** — the comfort-exchange flow (§3), narrated warmly, never as a form.
- **Home ("Tonight"):** living sky + `Day _/90` + one line from the guide + one action (log tonight / talk to guide / continue a fitting).
- **Tips content** is a structured, easy-to-edit layer (finetuned collaboratively); not hard-coded prose.

## 3. The fitting — exchange flow (re-skinned from old app's 7-step, adapted to comfort exchange)
1. **Entry** — open pre-filled link (`/claim?token=…`); light verify (last name + delivery date) against the registered guarantee.
2. **Welcome / eligibility** — show registered Mattress Set; server computes eligibility (see §5) and shows status + the day 31–90 window.
3. **Prep** — explain what's needed: like-new/sanitary condition, both partners present at selection, law tag + model label legible, waterproof-protector recommendation.
4. **Capture** — guided live-camera capture of required angles (law tag, model label, overall set, protector). AI coach verifies legibility/framing in real time.
5. **Condition attestation** — consumer attests like-new/sanitary + both-partners-present acknowledgment.
6. **Review & fees** — summary; restocking fee (config) + note that any price difference is paid at the dealer. Payment step is a seam (no live charge in v1).
7. **Submit → Done** — request created (status `submitted`); consumer can track it in "My Requests."

## 4. Roles & workflow
- **Consumer** — files + tracks own request; light-verify session (no password).
- **RAP admin** — queue of requests; view photos + AI coach results; **approve → issue RA#** or **deny (reason)**; internal notes.
- **Dealer** — read view of RAP-**authorized** exchanges for their location; mark **completed** (records completion date); no approve/deny power.

**Status machine:** `submitted → in_review → approved (RA# issued) → dealer_scheduled → completed`
Terminal/side: `denied`, `expired` (past day 90), `withdrawn`.

## 5. Eligibility rules (server-authoritative — port to old app's `plans.mjs` pattern)
- Window: request + approval + selection + **completion** must fall within **day 31–90** after delivery/start date. (Fix Grok's off-by-one: floor is day **31**, not 30.)
- One-time exchange only.
- Replacement: in-stock, **equal or greater value**; consumer pays price difference at dealer; credit excludes taxes/delivery/financing/accessories.
- **Restocking fee** (config value) due at exchange. No refunds, no cash value.
- Both sleep partners present in-store to select.
- Law tag + model label attached, legible, unaltered (removal voids). Like-new/sanitary condition.
- RAP approves/denies (not Dealer). Proof of purchase on file. US only, original Dealer/location.

All rule outputs are **citable** (rule id + human message) so admin decisions and consumer messages trace to a term.

## 6. Data model (from Grok's `lib/types.ts` + `supabase/schema.sql`, extended)
Core tables (Supabase, RLS by role):
- `guarantees` — registration record: customer, dealer, dealer_location, sales_order_number, guarantee_number, oem_model, purchase_price, delivery_date. (Seeded from CRM export.)
- `claims` — one comfort-exchange request per guarantee: status, ra_number, denial_reason, timestamps, restocking_fee, price_difference (nullable).
- `claim_photos` — angle (`law_tag` | `model_tag` | `overall` | `protector`), storage path, ai_coach result.
- `claim_notes` — author, body, `is_internal` (admin-only).
- `profiles` / roles — `consumer` | `rap_admin` | `dealer`, dealer scoped to a location.
- `payments` (seam) — kind (`restocking_fee` | `price_difference`), amount, status placeholder for Stripe.

Sleep-companion tables:
- `journey` — per guarantee: start/delivery date, current day, phase (`settle_in` | `safety_net` | `resolved`), computed from delivery date.
- `check_ins` — nightly: date, feeling (`better` | `same` | `rougher`), optional note.
- `tips` — content layer (id, day/phase targeting, time-of-day, title, body); editable, seedable from a file.
- `concierge_threads` / `concierge_messages` — the guide conversation (role, body, created_at); powers the AI concierge + narrated tasks.

## 7. Integrations
- **Supabase** — Postgres + Auth (magic-token/verify session) + Storage (photos). RLS enforces role/location scoping.
- **Anthropic** — photo-coach vision calls; key optional, degrades to non-AI guided capture.
- **Stripe** — *seam only*; `payments` rows + UI step; dev team completes.
- **Netlify** — deploy from git (this repo). Current `main` stays deployable during rebuild.

## 8. PWA / mobile
Installable (manifest + real icons, replace the broken `/next.svg`), service worker for offline shell, `100dvh`/safe-area discipline from the old app. Camera-first on mobile.

## 9. Out of scope (v1)
Full sleep-tracking **platform** (wearables/device data, routines, content library, community) — v2+. Full dealer portal (registration entry, messaging, inventory-aware selection); CRM push (dev team pulls from Supabase); warranty/defect claims; the invented "$29 Fast In-Person Inspection"; email/SMS notifications (candidate for v1.1).

## 10. Known cleanup carried from prototypes
- Fix eligibility day 30→31.
- Drop Grok demo stubs (`DEMO_CLAIMS`, inline admin array, chat mock, simulate-upload buttons).
- Strip old-app warranty content/branding ("5 Star Service", sag/stain templates, sample data); keep the shell + design system.
- Remove Grok's unused deps (zod, cva, clsx, tailwind-merge, lucide-react, date-fns) unless re-justified during build.
