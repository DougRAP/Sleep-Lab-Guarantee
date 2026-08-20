# Handoff R-8 — Capture the customer's own account of the problem

**For:** Maker 1 · **From:** master agent · **Punch list:** `misc/PUNCH-LIST-08-19.html` (R-8) · **Review:** `misc/TECHNICAL-REVIEW.html` (E-3) · **State:** `main` at `9e19d95`. R-1 to R-5 built, tested, committed, unpushed.

**Hard rules:** design locked (`DESIGN.md`). Data through the repository layer. Rules in pure functions under `lib/` with a `.test.ts` beside them. Calm consumer copy. Done = `npx tsc --noEmit` + `npm test` + `npm run build` + `npm run test:e2e` (both suites), real output pasted.

## Where the authority comes from, exactly

**Emy's sheet**, and her screenshot of `/requests/…` for claim `CGAHAZA4`:

> IN YOUR WORDS
> Nothing recorded here.

**Not Doug.** He went through her sheet item by item on the call and this one never came up. **Adrian decided it in this session**: if the field does not exist, we create it. It is also promised in the message to Doug. Say so in the commit: the authority is Emy plus Adrian, not the call.

It follows that **`docs/SPEC-v3-simple-claims.md` §2, approved by Doug on August 18, does not list this**. The v3 flow it specifies is: details, qualification checkboxes, photos, process explainer, submit. R-8 adds capture the spec does not describe, which is a deliberate, authorised addition; the spec should gain a line.

## Goal

Both detail views render the customer's own words and nothing ever fills them. Every v3 claim reads "Nothing recorded here", so the agent deciding the case gets ticked boxes and not one line about what is actually wrong with the mattress. For a product whose whole premise is that a human decides, that is the costliest information loss on the list.

## What is true today, verified

- **Rendered, twice.** `app/(app)/requests/[id]/page.tsx:169` renders a section titled "In your words" (`reasonExperience`), then "What you'd rather have" (`preferredReplacement`) when present. `app/admin/requests/[id]/page.tsx:243` renders the same pair as "In their words", but only when at least one is set, so today the agent sees nothing at all.
- **Captured, once, in the wrong flow.** `components/fitting/intake-step.tsx` holds both fields, labelled "Your experience" and "What you'd rather have", in a local `Prose` component. Only the v2 fitting uses it.
- **The model is ready.** `UpdateClaimInput` carries `reasonExperience` and `preferredReplacement`; both repositories persist them; the columns exist.
- **No migration is needed, and none should be added.** `claims.step` has a CHECK constraint over six values (`supabase/schema.sql:178`), so a NEW wizard stage would require altering it in both the base schema and a migration. Do not.

## Tasks

### 1. The rule

A pure function in `lib/claim-flow.ts` with tests beside it, deciding what counts as recorded. Trim; whitespace-only is nothing, because both views test with `.trim()` and a phantom entry would render an empty section. **Do not invent a maximum length**: the v2 field has none, and nobody asked for one.

### 2. Share the field

`Prose` in `components/fitting/intake-step.tsx` is exactly the control this needs. Extract it to `components/ui/` and have both flows use it. Do not fork it, and do not restyle it.

### 3. The step

Both fields go on the **existing details step** (`DetailsStep` in `components/claim/claim-flow.tsx`), below the day count and the early choice, above the error line. **Optional, both of them.** Not a new stage: the punch list's own framing of this question is "optional so the form stays short", a new stage needs a schema migration, and the wizard's stage machinery, its Back, its resume points and its e2e suite are all R-2 and R-3 work that must not be disturbed.

Capture **both** fields, not one. They are a pair in the model, in the v2 control, and in both render sites; capturing one would leave the second dead section that E-3 is about.

### 4. Do not break Back

R-2's invariant is that nothing typed is lost going backward, and `ClaimFlow` holds the entered values in client state for exactly that reason. The two new fields must join `ClaimFlowProps["details"]` and the state that `DetailsStep` hands back through `onDone`, or Back will wipe them and undo R-2 on this screen. There is an e2e test for the principle; add one for these fields.

### 5. The action

`saveClaimDetails` (`lib/actions/claim.ts:177`) reads the form and writes through `updateClaim`. Add the two fields there, through the rule from task 1, and keep the action a thin wrapper the way the house convention asks.

### 6. Tests

**Unit**: the rule (empty, whitespace-only, trimmed, unchanged).

**e2e** in `e2e/claims/`, using `startAClaim` from `e2e/claims/support.ts`: the words survive Back and forward again, and reach submit. **State the ceiling honestly**: an anonymous claimant cannot open `/requests/[id]`, so no e2e here can prove the words render on the detail view. Do not build a harness for it.

## Out of scope

Removing the two dead sections (the other half of E-3's question; we are filling them, not deleting them) · any change to the wizard's stages, to `CLAIM_STAGES`, or to the `claims.step` constraint · a character limit · making either field required · the admin side, which already renders them · R-6 and R-7.

## Watch for

The details step is where R-3 lives. Its Next button is disabled while the dates are impossible, and the day-count card and the before-night-31 choice both stand down in that state. The new fields must not gain any of that behaviour: they are optional, they never block, and they must stay usable while a date is being corrected.

## Report back

Files touched · the rule's signature · confirmation that Back still keeps what was typed, and how you proved it · test counts before and after · real command output for all four gates · what remains uncovered and why · `test-guide.html` gains this case.
