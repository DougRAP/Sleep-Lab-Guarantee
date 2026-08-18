# Handoff M-S1 — Data layer for simplified claims (v3)

**For:** Maker 1 (builder agent) · **From:** master agent · **Spec:** `docs/SPEC-v3-simple-claims.md` (read it first, esp. §4)

**Hard rules**
- Do not change the design — execute it. No new colors, fonts, or components.
- Data access goes through the repository layer only (`lib/data/`), never Supabase directly.
- Do not touch UI in this milestone. Data layer + pure helpers + tests only.
- Do not delete coach/concierge code or tables.
- When done: `npx tsc --noEmit` clean, `npm test` green, `npm run build` green. Report actual output; do not claim green without running.

## Tasks

### 1. Claim-number generator — `lib/ra.ts`
- `generateClaimNumber(): string` → `CG` + 6 chars from the existing `CODE_ALPHABET` (`lib/ra.ts:15`). Format `CG######`, **no space, no dash**.
- `isClaimNumber(value: string): boolean` validator alongside `isRaNumber`/`isTrackingNumber`.
- Unit tests mirroring the existing RA tests.

### 2. Schema — `supabase/schema.sql`
Edit the schema file (idempotent style consistent with the file) and note in a comment that existing deployments need the equivalent `ALTER`s:
- `claims.guarantee_id` → nullable (keep FK + cascade).
- New `claims` columns: `claim_number text unique`, `first_name text`, `last_name text`, `delivery_zip text`, `sales_order_number text`, `model_number text`, `purchase_date date`, `delivery_date date`, `protector_used boolean`, `days_in_service_at_submit int`, `early_preference text check in ('auto_submit_day_31','agent_call') null` (set only when submitted before day 31).
- Status check constraint: add `inspection_scheduled`.
- New table `claim_links` (`id uuid pk`, `claim_id fk→claims cascade`, `kind text check in ('exchange_authorization','tech_report','other')`, `url text`, `label text`, `created_by uuid null`, `created_at timestamptz default now()`), RLS matching `claim_notes` conventions (consumer read own via claim→guarantee/claim ownership; `rap_admin` all; dealer scoped).
- Anonymous claims have no `auth.uid()` — RLS for consumer reads may simply not apply to unlinked claims (service-role access only). Follow the existing pattern; do not weaken existing policies.

### 3. Types — `lib/types.ts`
- Extend `Claim` with the new fields (optional/nullable as appropriate); add `ClaimLink` type; add `inspection_scheduled` to the status union; update `assertClaimStatusTransition` (`lib/data/repository.ts:297`) transitions: `in_review → inspection_scheduled → approved|denied` (plus `inspection_scheduled → in_review`).

### 4. Repository interface — `lib/data/repository.ts` (M5 block, ~`:388-429`)
New methods, implemented in **both** `memory-repository.ts` and `supabase-repository.ts`:
- `createAnonymousClaim(input: CreateAnonymousClaimInput): Promise<Claim>` — input: `firstName`, `lastName`, `deliveryZip`; creates a `draft` claim with `guarantee_id = null`, default dealer location (use the seeded dealer location id).
- `getClaimByNumber(claimNumber: string): Promise<Claim | null>`.
- `updateClaim` — accept the new fields (contact + purchase details + `protector_used`).
- `submitClaim` changes: mint `claim_number` via `generateClaimNumber()` (idempotent — keep existing if already set; retry on unique collision in the Supabase impl), snapshot `days_in_service_at_submit` from `delivery_date` when present, accept an optional `earlyPreference`, and **stop minting `ra_number` and `tracking_number`** at submit (leave both columns; RA becomes a manual admin action in M-S4; `CG######` is the single customer reference).
- `listClaimLinks(claimId)`, `addClaimLink(input)` with staff scope checks mirroring `listClaimNotes`/`addClaimNote` (`:484-491`).
- `claimSearchMatches` (`:177`): also match `claim_number` (case-insensitive, with or without `CG` prefix).
- Attempt auto-match helper (pure, module scope): `matchGuarantee(guarantees, {lastName, deliveryZip, salesOrderNumber?})` — exact last-name (case-insensitive) + ZIP; if `salesOrderNumber` given it must also match. Used by a repo method `linkClaimToGuaranteeIfMatched(claimId)` called at submit. Never throws on no-match.

### 5. Seed — `lib/data/seed.ts` + `supabase/seed.sql`
Add one submitted anonymous claim (unlinked, with claim number) so admin views have data to render in M-S4.

### 6. Tests (vitest, colocated per existing pattern)
- Generator format/validator.
- `createAnonymousClaim` → draft, null guarantee.
- `submitClaim` → claim number minted, idempotent, no RA minted, days-in-service snapshot.
- `getClaimByNumber` round-trip; search by claim number.
- Auto-match: match, no-match, sales-order-mismatch cases.
- Status transition additions.
- Existing tests must stay green — if a test asserts RA-minted-at-submit, update it to the new rule and say so in your report.

## Out of scope (do NOT do)
UI changes · middleware/session changes · admin pages · removing coach anything · README/docs edits.

## Report back
Files touched, test count before/after, any existing tests you had to change and why, any schema decision you had to make beyond this brief.
