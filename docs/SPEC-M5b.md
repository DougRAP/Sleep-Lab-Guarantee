# SPEC — M5b: Requests tracking + coupon on request

**Status:** locked · **Written:** 2026-07-19 · **Owner:** master agent
**Read first:** `DESIGN.md` (design is LOCKED), `docs/PRD-v2-expansion.md` (#3 tracking, #6 coupon), `docs/DEV-NOTES.md`.

This spec resolves the open design decisions. Execute it — do not redesign.

---

## Part 1 — Requests tracking

### 1.1 New repository method (both implementations)

`listClaimRecords` is the admin/dealer read: it has no per-guarantee scope and excludes drafts. Do not widen it — admin and consumer reads have different rules and must not share a code path.

Add to `GuaranteeRepository`:

```ts
/** Every claim for one guarantee, newest first. Includes drafts — the
 *  consumer's own in-progress request is a thing they should see. */
listClaimsForGuarantee(guaranteeId: string): Promise<Claim[]>;
```

Implement in **both** `MemoryRepository` and `SupabaseRepository`. Sort with the existing `byMostRecent` helper. Supabase: filter `.eq("guarantee_id", …)` — no `.neq("status","draft")`.

### 1.2 Extract the status vocabulary

`statusLabel` is currently module-private in `app/admin/page.tsx:145-158`. Move it to **`lib/claim-status.ts`**, export it, and have admin import it. Same labels, unchanged — consumer and staff must never describe a status differently to each other.

Add alongside it:

```ts
/** The calm one-line answer to "what happens now?", per status. */
export function statusNextStep(status: ClaimStatus): string;
```

Copy: no ticket language, no "we will process your request". E.g. `submitted` → "RAP has your request. You'll hear from your dealer about next steps." `draft` → "Pick up where you left off whenever you're ready."

Pure module, no imports from `app/` — unit-test it.

### 1.3 `/requests` list — replace the placeholder

`app/(app)/requests/page.tsx` keeps its shell (LivingSky, header, `requireGuarantee()`). Replace the hardcoded empty state with the real list.

- **Empty:** keep the existing `ConciergeCard` copy verbatim. It is already right.
- **Rows:** a `FrostedCard` per claim, modeled on `AdminRow` (`app/admin/page.tsx:105-129`) but consumer-facing — the tracking number is the identity, not the sales order. Show: tracking number (mono, or "Not yet submitted" for a draft), `statusLabel`, submitted date in plain language, item count.
- **Draft rows link to `/fitting`** (resume), never to a detail page — a draft has no tracking number and nothing to track.
- **Submitted rows link to `/requests/[id]`.**
- Reuse `FrostedCard`, `buttonVariants` on `<Link>`. Do not invent components. No color-only status signalling.

### 1.4 `/requests/[id]` — detail

New route `app/(app)/requests/[id]/page.tsx`.

**🔒 Security — the critical rule of this milestone.** Everywhere else the client never names a claim id (`lib/actions/fitting.ts:64-76`). This route breaks that for the first time, so it must re-establish the guarantee itself:

```
const { guarantee } = await requireGuarantee();
const claim = await repo.getClaimById(params.id);
if (!claim || claim.guaranteeId !== guarantee.id) notFound();
```

Never trust the URL id alone. A claim belonging to another guarantee must be indistinguishable from one that does not exist — `notFound()`, not a redirect, and no message that confirms the id is real. **This needs a test** (see 3.2).

Also `notFound()` for `status === "draft"` — drafts live at `/fitting`.

**Content:** RA number + tracking number (reuse the `Stat` pattern from `components/fitting/submitted-step.tsx:56` — promote it to a shared component if used in both), `statusLabel` + `statusNextStep`, submitted date, the claim items (model numbers), reason/experience and preferred replacement in the customer's own words, and the list of photo angles captured.

**Do not** render photo images — that needs signed-URL plumbing and is deliberately out of scope for M5b. List the angles as text.

**Do not** build a multi-step progress tracker. Nothing in the codebase advances a claim past `submitted`, so a 5-step timeline would be four steps of theatre. Show the current status and one honest next-step line.

---

## Part 2 — Coupon on request

Replaces the static always-on card. PRD #6 is explicit: "generated **locally on customer request** — a unique code with a **4-week expiry** … shown to the customer (**not a static always-on code**)."

### 2.1 `lib/coupon.ts` — pure module

```ts
export const COUPON_VALID_DAYS = 28;              // 4 weeks
export function generateCouponCode(random?): string;   // "SLP-XXXXXX"
export function couponExpiresAt(issuedAt: string): string;
export function isCouponExpired(coupon, now): boolean;
```

Reuse the `lib/ra.ts` alphabet (`23456789ABCDEFGHJKLMNPQRSTVWXYZ` — excludes I/O/0/1/U because codes get read aloud). Format `SLP-XXXXXX`; must not collide with `RA-` or `RAP-` prefixes. Unit-test generation, expiry math, and the boundary (day 28 valid, day 29 expired).

### 2.2 Persistence — a real table

Persist; do not hold in memory or derive on the fly. An unpersisted code changes on every refresh, which makes it worthless to a customer who comes back to it.

`Coupon` type in `lib/types.ts`: `id`, `guaranteeId`, `dealerLocationId`, `code`, `pct`, `issuedAt`, `expiresAt`.

Repository methods (**both** implementations), plus `supabase/schema.sql` table + RLS matching the existing claim-table pattern:

```ts
getActiveCoupon(guaranteeId: string): Promise<Coupon | null>;  // null if none or expired
issueCoupon(guaranteeId: string): Promise<Coupon>;
```

`issueCoupon` is **idempotent** — an unexpired coupon is returned as-is, never reissued. This matches `createDraftClaim` and `submitClaim`, which are both idempotent. `pct` is copied from the dealer's `couponPct` at issue time so a later dealer change can't silently alter a code already in a customer's hands.

### 2.3 Shop UI

Replace `app/(app)/shop/page.tsx:47-63`.

- **No active coupon:** a `FrostedCard` explaining the offer with a **"Get your coupon"** `<Button>` (server action → `issueCoupon`, then `revalidatePath("/shop")`).
- **Active coupon:** the code (mono, same treatment as the current static card), the discount (`{pct}% off at checkout`), the expiry in plain language ("Good through August 16" — **US month-first ordering**; the guarantee is sold in the US only), and verbatim: **"Subject to dealer conditions and rules of acceptance."**
- Reuse `FrostedCard` + `Button`. No countdown timers, no urgency styling — this is a calm product.

---

## Part 3 — Verification (required before hand-back)

1. `npx tsc --noEmit` clean · `npm test` all green (198 passing today; only additions) · `npm run build` exit 0.
2. **New repo-backed tests**, colocated `lib/**/*.test.ts` per convention, driving a real `MemoryRepository` with no mocks (pattern: `lib/data/dealer-location.test.ts`, `lib/data/fitting-repository.test.ts`):
   - `listClaimsForGuarantee` returns only that guarantee's claims, newest first, drafts included.
   - **Cross-guarantee isolation:** a claim id from guarantee A is not retrievable via guarantee B. This is the 1.4 rule at the repository seam.
   - `issueCoupon` is idempotent; a fresh coupon is returned once expired; `pct` snapshots the dealer value.
   - `lib/claim-status.ts` and `lib/coupon.ts` pure-unit tests.
3. Note in the hand-back that page/component tests are **not** expected — `vitest.config.ts` is `environment: "node"` with `include: ["lib/**/*.test.ts"]`, and there is no RTL in the project. Do not add a test framework.

## Out of scope — do not build

Photo rendering/signed URLs · any status advancement past `submitted` (RAP adjudicates elsewhere) · admin approve/deny · Stripe · notifications · real dealer data (`SLEEPLAB20` / 20% / "Demo Bedding Co." stays placeholder).
