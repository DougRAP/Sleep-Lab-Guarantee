# SPEC v3 — Simplified Claims Intake ("Start Simple")

**Status:** Approved by Doug 2026-08-18 (this doc encodes his answers) · **Owner:** master agent · **Builder:** Maker 1 (Opus) via narrow handoffs
**Driver:** City Mattress feedback — app too advanced in customer interaction. Claim-first, identity-light, human-in-the-loop.
**Authoritative terms:** `docs/CMFG-90-CITY-GS.html` (dealer may request changes).

---

## 1. Product shape

- **No coach.** Coach and the Tonight journey are **hidden and disabled** (build on the existing `NEXT_PUBLIC_CLAIMS_MODE` flag, `middleware.ts:86-88`), not deleted — code retained for later. **Shop stays visible** (remove `/shop` from the hidden set).
- **No login to file.** Customer files an exchange request anonymously. Login exists only for **post-submit tracking**.
- **Human in the loop.** RAP pulls claims from Supabase into its own admin system (SQL Server enterprise), adjudicates there, then agents **manually update the app dashboard**: change status, add notes, attach links (exchange authorization, tech reports) — so RAP customer service and the dealer's service team stay coordinated.
- Customer can always **call or email** instead: claims@raptns.com · phone TBD.

## 2. Customer flow (steps, in order)

Reuse the existing fitting step components wherever noted. Design stays locked (`DESIGN.md`) — existing kit only.

1. **Landing** *(Doug 2026-08-18)* — welcome + **link to the full Comfort Guarantee terms** (self-hosted copy of `docs/CMFG-90-CITY-GS.html`) + the entry form (step 2) on the same page. No account gate, no coach/companion language. Copy basis (Doug's words, lightly edited at build):
   > Your purchase includes a 90-Night Comfort Guarantee. Requesting an exchange, asking advice, or getting other helpful information starts here. To get started, enter the information below. At any time, call us at (800) 111-1110 [placeholder] or email us at comfort@raptns.com.

   *(Note: the guarantee document says claims@raptns.com; Doug specified comfort@raptns.com for the app — flagged, Doug's copy wins until he says otherwise. Phone is a placeholder.)*
2. **Identify + contact** *(single form, on the landing page)* —
   - **Sales order number OR delivery ZIP** (either one; both accepted)
   - **Last name** (required); first name asked, required
   - **Email or mobile phone** (at least one required — the EA is delivered by text or email)
3. *(merged into 2)*
4. **Purchase details** *(adapt `items-step`)* — mattress model number, date of purchase, **date of delivery** (date received); sales order number here if not given at entry.
   - On delivery date entry, **auto-calculate time in service in days** (delivery = day 0, reuse `lib/eligibility.ts` engine on the self-reported date) and display with the appropriate message:
     - **< 31 days:** allow submission. Advise it's not quite 31 nights yet, and ask the customer to choose: **auto-submit when day 31 is reached**, or **request a call from an agent**. Choice stored on the claim (`early_preference`).
     - **31–90:** "you're in your exchange window, day {n} of 90."
     - **> 90 days:** calm warning that the 90-night window has passed; allow submission anyway (agent adjudicates) and suggest calling.
5. **Qualification checkboxes** *(reuse `confirmations-step` / `CONFIRMATION_TERMS`, copy updated to CMFG-90-CITY-GS)* — all required before submit:
   - 31+ nights since delivery · not more than 90 nights
   - No stains, odors, or damage; like-new condition
   - Law tag and model tag still attached and unaltered
   - Original owner; household use only; still in my possession
   - Purchased from City Mattress in the US; exchange at their store
   - Both sleep partners can be present to choose the replacement
   - **Mattress protector used** — checkbox but **not required** (informational, per Doug).
6. **Photos — optional, speeds service** *(reuse `photos-step`; flip required→optional)*
   - Trimmed set: **law tag · model tag · top-down**, plus **sales receipt (optional)**.
   - Instructions: **remove all bedding, linens, and protectors before taking pictures**.
   - Copy: photos are optional and speed the review; since we may send a technician, we can complete them later.
   - `canSubmit()` no longer gates on photos.
7. **Service process explainer** *(new content step, existing card components)* — brief:
   - We review your request.
   - We may send a technician to inspect — **we will call before doing so**.
   - We may issue an **exchange authorization**, sent by **text or email**.
   - If exchanged: **City Mattress schedules the pickup**; customer pays City Mattress the **$199 comfort exchange fee** (+ Cal King restocking fee if applicable, + any price difference).
8. **Submit** → mint **claim number `CG######`** (no space; safe alphabet, see §4) → confirmation screen:
   - Claim number, prominent.
   - Link to **create account / log in to track progress** (existing auth + `/requests`).
   - claims@raptns.com · phone (TBD placeholder).

## 3. Session & matching

- Anonymous intake carried by a lightweight signed cookie holding `claimId` (same HMAC machinery as `lib/session.ts`); draft resumable like today.
- **Auto-match** claimant against registered `guarantees` on (sales order # + last name) or (ZIP + last name); link `claims.guarantee_id` when the match is unique. **Never block on no-match** — unlinked claims go through; RAP agent matches manually.
- **Full terms self-hosted**: `docs/CMFG-90-CITY-GS.html` is served by the app itself (resolves the old `example.com` placeholder). Dealer-requested changes replace that file.
- Post-submit tracking: account links a claim by **claim number + last name** (parallel to today's sales-order linking).

## 4. Data model changes (`supabase/schema.sql` + both repositories)

- `claims.guarantee_id` → **nullable** (FK kept).
- New `claims` columns: `claim_number` (unique, `CG` + 6 chars from the `CODE_ALPHABET` in `lib/ra.ts` — no space, format `CG######`), `first_name`, `last_name`, `delivery_zip`, `sales_order_number`, `model_number`, `purchase_date`, `delivery_date`, `protector_used` (bool), `days_in_service_at_submit` (int, snapshot), `early_preference` (`auto_submit_day_31` | `agent_call`, null when submitted in-window).
- New table **`claim_links`**: `id`, `claim_id`, `kind` (`exchange_authorization` | `tech_report` | `other`), `url`, `label`, `created_by`, `created_at`. This is how agents attach EA docs / tech reports.
- Status enum: add **`inspection_scheduled`** (tech visit). Existing statuses retained.
- **RA is no longer auto-minted at submit.** Submit mints `claim_number` only. `tracking_number` is **retired** as customer-facing (column stays, no longer minted); `CG######` is the single customer reference. RA/EA issuance is a manual admin action.
- Default `dealer_location` = City Mattress for scoping of unlinked claims.
- RAP's dev team pulls from Supabase into SQL Server — we owe them nothing but a clean schema; document columns in this file as they land.

## 5. Admin dashboard (retained + extended)

Keep everything that exists (search by name/ZIP/phone/email/order #, status + date filters, status transitions, staff notes, dealer scoping). Add:
- `claim_number` in list + search.
- Claimant fields (name, ZIP, contact, self-reported dates, days in service) on detail.
- Unlinked-claim handling (no guarantee row → render from claim's own fields).
- **Add link** action (kind + URL + label → `claim_links`), shown on detail for both RAP and dealer roles.
- "Issue exchange authorization" = agent sets status + attaches EA link; sending to the customer stays manual for now.

## 6. Out of scope (v3)

Notifications (email/SMS) · Stripe · AI photo coach · conversational AI intake (guided form only) · deleting coach/Tonight/Shop code.

## 7. Open questions

1. Exact "appropriate message" copy for the three day-count states — drafted at build, Doug approves.
2. Phone number — placeholder until provided.
3. Auto-submit-at-day-31 mechanics: v3 stores the preference and surfaces it to agents on the dashboard (agent activates on/after day 31). No scheduler is built.

*(Resolved 2026-08-18: <31 allowed with early_preference choice; >90 allowed with warning; Shop kept; coach hidden+disabled; tracking_number retired.)*

## 8. Milestones

| # | Scope | Verification |
|---|---|---|
| M-S1 | Data layer: schema migration, claim-number generator, repo methods (`createAnonymousClaim`, `getClaimByNumber`, `addClaimLink`…), both backends, tests | `tsc` + `vitest` + build |
| M-S2 | Intake flow (steps §2), day-count calc + messages, submit + confirmation | + e2e smoke |
| M-S3 | Simplified shell: claims-mode default, coach/Tonight/Shop hidden, dead links removed, landing page | manual review |
| M-S4 | Admin: claim number, claimant display, unlinked claims, claim links, statuses | + tests |
| M-S5 | Tracking: link claim by number+last name, `/requests` shows it; docs sweep | full suite |
