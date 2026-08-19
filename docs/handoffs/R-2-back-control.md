# Handoff R-2 — Back through the whole app (Aug 19 punch list)

**For:** Maker 1 (fresh session) · **From:** master agent · **Punch list:** `misc/PUNCH-LIST-08-19.html` (R-2) · **Spec:** `docs/SPEC-v3-simple-claims.md` · **Design:** `DESIGN.md` · **State:** R-1 is built and committed on `r-1/app-wide-footer` (`ccfeec1`). Start from that branch, not from `main`, because R-2 fills the slot R-1 left. Read `docs/handoffs/R-1-app-wide-footer.md` and `git show ccfeec1 --stat` before touching anything.

**Hard rules:** design locked (`DESIGN.md`) — execute it, don't redesign; existing components and tokens only. Which surfaces exist lives in `lib/shell.ts`, never in a component. Data through the repository layer, never Supabase directly. Rules live in pure functions under `lib/` with a `.test.ts` beside them, not in components. Calm consumer copy: no red, no ticket language. Do not commit or push — the master agent reviews, commits, deploys. Done = `npx tsc --noEmit` clean + `npm test` green + `npm run build` green + `npm run test:e2e` green (both suites), with the real output pasted in your report.

## Goal

Emy, 2026-08-19: *"Request exchange images — No Back Button."*
Doug, on the call: *"So she wants a back button." … "That back button will be for all the application, right?" … "Everybody likes back buttons. If you have room, you could just put a footer on it."*

Give the customer a way back. One control, in the footer slot R-1 left, appearing only where "back" has an unambiguous meaning.

## Where things stand

**The fitting already has Back, and it is the reference implementation.**
`components/fitting/fitting-flow.tsx:72-90` renders `‹ Back` inline next to `ProgressDots`, driven by `previousStep()` (`lib/fitting.ts:351`, pure, ordered by `FITTING_STEPS`). It is hidden on `submitted`. Read `go()` at `:66-77` closely: it sets the step, scrolls to top, persists the resume point, then calls `router.refresh()` — and each step component is **keyed by the values it starts from** (`:102`), so a refresh remounts it with what was actually saved. The comment at `:96-99` says why: *"stepping back never shows stale entries."*

**The claim flow has none of that.**
`components/claim/claim-flow.tsx` moves forward only, through `setStage`. It has no router and calls no refresh: `grep -n "useRouter\|router\.\|refresh" components/claim/claim-flow.tsx` returns nothing. Its props come from the one server render in `app/claim/page.tsx`. The server actions do persist (`saveClaimDetails` writes `step: "confirmations"`), but the client never re-reads, so **a naive Back would show the values the page was first rendered with, not what the customer just typed**. That is the single biggest trap in this task.

`ClaimStage` is declared in the component (`claim-flow.tsx:30`) as a bare union with no order and no helper. `lib/claim-flow.ts` is where its pure rules already live (13 exports, tested in `lib/claim-flow.test.ts`).

**The footer slot exists but is not wired.**
R-1 added `leading?: React.ReactNode` to `BottomNav` (`components/nav/bottom-nav.tsx`), with a bordered leading cell ready in the layout. Its only caller is `components/nav/app-footer.tsx`, rendered from the root layout, which has no pathname and no knowledge of any flow's state. The docblock on the prop says so plainly. Wiring that is your job.

## Tasks

### 1. The stage order, as a pure rule

Move the stage vocabulary out of the component and into `lib/claim-flow.ts`, next to the rules that already live there: an ordered `CLAIM_STAGES` and a `previousStage(stage): ClaimStage | null`, mirroring `FITTING_STEPS` / `previousStep`. `details` returns null (the entry form is a different page and the claim already exists). `done` returns null: the CG number is minted and there is no going back from it. `components/claim/claim-flow.tsx` imports the type from there rather than declaring it.

### 2. A back registry, so the footer can reach the flow

The footer is rendered from the root layout and the steps are component state, so nothing can travel between them without a seam. Add a small client context (`components/nav/back-context.tsx` or wherever fits): a provider near the root, a hook a flow calls to register `{ label?, onBack }` while it has somewhere to go, and a consumer inside `BottomNav` that renders the control into the existing `leading` slot.

Keep it minimal and honest:
- Registration is an effect that clears on unmount, so leaving a flow removes the control. No stale handler may survive a navigation.
- Nothing registered means nothing renders, and the bar is byte-identical to R-1's output.
- The provider must not force the whole app to be a client tree. Wrap only what needs it.

### 3. Wire both flows, and retire the duplicate

- `components/claim/claim-flow.tsx` registers a handler whenever `previousStage(stage)` is non-null.
- `components/fitting/fitting-flow.tsx` registers the handler it already computes, and its **inline `‹ Back` button is removed**. One Back in the app, not two. `ProgressDots` stays where it is.
- Both keep the existing behaviour on the closing screen: no Back once the request is in.

### 4. Make going back honest in the claim flow

This is the part that will bite. Going back must show what was persisted, not what the page first rendered. Copy the mechanism that already works in `fitting-flow.tsx`: persist the stage, `router.refresh()`, and key each step component by the saved values it starts from so it remounts. Scroll to top on every move, as the fitting does.

If you find a simpler correct answer (for instance holding the edited values in the flow's own state so no refresh is needed), take it and say why in your report — but prove it with the e2e in task 6, not by argument.

### 5. Design

The control is the one in `fitting-flow.tsx:84-90`: `‹ Back`, mono, `text-mist` with `hover:text-cloud`. No new tokens, no new sizes. It sits in the leading cell R-1 built, divided by the same hairline the Coach uses. `--dawn` is reserved for the active destination and must not be used here. Give it a real touch target: R-1's review caught support links shipping a 15px hit area next to 59px tabs, so match the tabs' `py`, not the text box.

### 6. Tests

**Unit** (`lib/claim-flow.test.ts`, extend it): `CLAIM_STAGES` order; `previousStage` for every stage; null at `details`; null at `done`.

**e2e** (`e2e/claims/`, the claims-mode suite R-1 added; run it with `npm run test:e2e:claims`): the assertion that earns its keep is the staleness one. Start a claim, fill the model number and both dates, advance to qualification, press Back, and assert **the model number is still in the field**. A Back that loses the customer's typing is worse than no Back. Also assert the control is absent on the confirmation screen once the CG number exists, and absent on `/` where no flow is mounted.

Note the suite's ceiling: with no Supabase there is no way to sign in, so it can only drive the anonymous claim. The fitting stays covered by the companion suite (`e2e/smoke.spec.ts`), which must stay green with the inline button gone.

## Out of scope

Making `/guarantee` and `/shop` work for unlinked accounts (R-6) · changing what any tab is called · notifications · schema changes · the customer's own description of the problem (R-8) · **history-based Back on ordinary pages** (see below).

## The question you must ask before task 2

Doug said "for all the application". This brief deliberately scopes Back to the two step flows, because on an ordinary page "back" would mean browser history, and one control with two different meanings is a trap: on `/requests/[id]` it would go to the list, but on `/guarantee` reached from the bottom nav it would go to whatever tab preceded it, which is not "back" in any sense the customer intended.

Build tasks 1 to 6 as written. Then **ask Doug** whether he wants the footer Back to also appear on routed pages as history-back, and report his answer rather than assuming it. If the answer is yes, it is a small addition on top of the registry you will have built.

## Report back

Files touched · the shape of the back registry and why you chose it · how you solved the staleness problem in task 4 and how the e2e proves it · confirmation that the fitting's inline button is gone and the companion suite is still green · test counts before and after, and which existing tests changed and why · real command output (`npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:e2e`) · any assumption or decision beyond this brief.
