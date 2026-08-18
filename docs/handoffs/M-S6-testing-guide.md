# Handoff M-S6 — Internal testing guide (HTML document)

**For:** Maker 2 · **From:** master agent
**Deliverable:** ONE self-contained HTML file at `docs/TESTING-GUIDE.html` that Doug can email to the RAP team. No code changes anywhere else. This is a writing task — accuracy against the shipped app is the whole job: verify every URL, credential, and behavior claim against the actual code before writing it down.

**Audience:** RAP's internal team (customer service + dev). Assume they have never seen the app. They will follow it step by step in a browser.

## Requirements

- **Self-contained HTML**: inline CSS only, no external assets, prints cleanly (this will be emailed and printed). Borrow the clean look of `docs/CMFG-90-CITY-GS.html` (same font stack / heading treatment) so RAP documents feel like a family. Title: "Sleep Lab — Testing Guide". Footer: Risk Assurance Partners, LLC + date.
- **Environments section**: production URL `https://sleep-lab-comfort-guarantee.netlify.app` · Supabase is live (data persists) · claims mode is the default product.
- **Test credentials table** (verify against `supabase/seed-test-accounts.sql`):
  - smith@test.com — day 16, too early by 15 days
  - jones@test.com — day 30, too early by 1 day
  - osborn@test.com — day 35 · johnson@test.com — day 45 · marks@test.com — day 60 (all in window)
  - Passwords: "the password set when the accounts were created (default suggestion Test1234!)" — do not invent a definite password.
  - Admin: dwright@raptns.com (role rap_admin). Note that admin sees /admin, consumers never do.
- **Seeded claims table** (verify against `supabase/seed-test-claims.sql` + `seed.sql`): CG7MKQ42 Osborne, CGX4T9RM Whitfield, CG2WPD84 Rios (auto day-31), CG9KFH37 Pemberton (wants call), CG5RVN68 Grantham (TTC-100482 + EA link), CGW8QM25 Sattler (TTC-100467 + tech report), plus the six legacy named claims.
- **Test scenarios** — numbered walkthroughs with expected results, at minimum:
  1. Anonymous claim, in-window (signed out, `/`): entry form → details day-count message → checkboxes → optional photos (skip path AND capture path) → explainer → CG number.
  2. Anonymous claim, too early: delivery date < 31 days → the auto-submit-day-31 / agent-call choice.
  3. Anonymous claim, past 90: warning, still submits.
  4. Entry validation: missing last name; neither order nor ZIP; neither email nor phone → calm messages.
  5. Full terms link → `/comfort-guarantee.html`.
  6. Linked journey: osborn@test.com → eligible → exchange flow → CG confirmation. smith/jones → gated states.
  7. Account tracking: create a fresh account → skip linking → `/requests` empty state → add claim by CG + last name → detail page.
  8. `/link` relaxed form: order path, ZIP path, miss → "Continue anyway".
  9. Admin: search (CG, name, ZIP), filters, status change (incl. Inspection scheduled), staff note, add document link (rap_admin only), unlinked chip, TTC display, early-preference markers.
  10. Sign out.
  11. Dev team: TTC + address write-back SQL snippets (copy from README/handoffs) and where the values appear afterward.
- **"What to report" section**: what a good bug report includes (URL, account, steps, expected vs seen, screenshot).
- Support contacts from `content/support.ts` (1-855-513-5435 / claims@raptns.com).

## Hard rules
- Verify every claim against the code/seeds — no invented behavior, URLs, or data. Where a password can't be known, say so.
- No changes to app code, tests, or other docs. The HTML file is the only deliverable.
- Report back: the file path, a list of claims you verified against code (spot-checkable), and anything you found while verifying that seems broken or surprising (do NOT fix it — report it).
