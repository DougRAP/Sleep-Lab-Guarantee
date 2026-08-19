# RAP Sleep Lab — Design System

**Status:** approved (direction, palette A, type stack) · **Branch:** `rebuild/comfort-guarantee-v1`
**Memorable thing:** *calm & reassuring* — a bedside companion, not a claims app.

## Visual thesis
A quiet nocturne that lightens toward dawn. Printed light on deep indigo; a warm literary voice over quiet "lab" precision. The identity lives in one tension — a warm serif **concierge voice** against a restrained mono **lab layer** (the day-count and metrics). That warm-vs-precise pairing *is* "Sleep **Lab**," and no competitor owns it.

## Brand
"RAP Sleep Lab" — a RAP-owned, **co-brandable** program identity (can carry a small dealer/retailer logo). Dark-first (bedroom/bedtime use).

## Color — Deep Indigo Nocturne (approved)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0E1420` | app ground (never pure black) |
| `--surface` | `#182236` | cards, raised layers |
| `--surface-2` | `#1E2A42` | frosted card fill |
| `--text` | `#EDEFF4` | primary (slightly warm off-white) |
| `--muted` | `#8A94A6` | secondary text |
| `--accent` | `#E9B384` | dawn apricot — primary action, "the coming morning" |
| `--accent-2` | `#C98B6B` | deeper dawn (gradients) |
| `--line` | `rgba(237,239,244,.10)` | hairlines, borders |

Semantic: success/eligible = a soft sage `#7FA08C`; caution = the apricot accent (never alarm-red in the consumer flow). **No red validation errors in capture.**
Alternates on file if we pivot: **B** Warm Oat/Espresso (day-usable), **C** Moonlit Slate (coolest).

## Typography
| Role | Font | Notes |
|---|---|---|
| Display / concierge voice | **Fraunces** (soft-optical serif; use italic for warmth) | the guide "speaks" in this — never the UI font |
| Body / UI | **Hanken Grotesk** | calm, low-light legible |
| Lab layer / numerals | **Spline Sans Mono** | Day _/90, metrics, labels |

All open-source, **self-hosted in production** (no CDN, PWA-friendly). Premium upgrade path: GT Alpina + Söhne. Never Inter/Roboto/Arial/system as primary.
Scale (mobile): hero mono 52 · voice serif 22 · body 15 · label mono 11–12 (uppercase, tracked).

## Layout & motion
- **First viewport = poster, not document.** One horizon, one line of the guide's voice, exactly one primary action. Content rises from beneath the fold on scroll. Chrome/nav stays hidden until summoned *(superseded for the bottom bar on 2026-08-19; see Bottom navigation)*.
- **One breath per screen** — single column, generous negative space.
- **Depth via soft blur + translucency** (frosted layers), not heavy borders.
- **Motion:** slow, unbounced — 400–700ms ease-out, opacity + slight rise, cross-fades (no skeleton jitter). One persistent ~4s breathing element sets the pace. Soft haptics. Always honor `prefers-reduced-motion`.
- **Hierarchy like Whoop:** one number that matters big (`Day _/90`), everything else quiet.

## Signature components
- **Living sky** — the app ground; a gradient that reacts to the user's real local time and **lightens across the 90 days** (night → dawn). The core novel move.
- **Concierge card** — frosted, serif-set message that surfaces and settles in. Presence via a soft breathing horizon/glow + optional waveform for voice. **No orb, no avatar, no bubble stack.**
- **Day-count** — mono `DAY 12 / 90`, apricot.
- **The fitting** (exchange capture) — full-bleed camera, soft dashed overlay guide per angle, warm coaching copy, gentle progress dots. Never a form.
- Buttons (dawn-gradient primary; ghost secondary), chips (pill, hairline), frosted cards.

## The concierge — voice & persona
A calm bedside guide. Named, consistent, warm but spare.
- **One thought at a time**, tied to time-of-day and journey-day. Proactive but gentle.
- Warmth comes from **restraint**, not exclamation points or forced friendliness (Pi.ai lesson). No emoji, no chirpy support-speak, no "Submit a request."
- Speaks in the serif. Narrates tasks ("let's take a look together") rather than presenting forms.
- Voice-first **optional**, text-anchored.
- Nightly **tips** are a tunable content layer (structured, easy to edit) — we finetune copy together.

## Anti-patterns (do not ship)
Purple→blue diagonal gradients · glowing/pulsing orb or avatar face · neon-on-black · stock meditation photography · 3-column icon-tile home (SaaS/insurance tell) · the exchange as a claims form (progress bars, required asterisks, red errors, ticket numbers) · chat UI with typing dots + green send bubble + emoji · pure `#000`/`#FFF` · Inter/Roboto/system as primary.

## Accessibility
Dark-first with contrast ≥ 4.5:1 for text (off-white on indigo passes); reduced-motion honored; dynamic type friendly; capture guidance never relies on color alone.

## Bottom navigation (v2 expansion)
The app becomes navigable without breaking the poster-first, printed-light calm.
- A persistent **bottom bar**: frosted/translucent (`backdrop-blur`, `bg-surface2/60`), a single hairline top border (`--line`), safe-area inset padding. No FAB, no orb, no heavy icon set.
- **Four utility destinations:** Tonight · Guarantee · Requests · Shop. Small label + a quiet line icon; the **active destination uses `--dawn`** (text), inactive `--mist`. One active at a time.
- **The Coach is set apart, not a peer tab** — the guide's presence, a serif/`--dawn` affordance divided from the utility tabs by a hairline (e.g. a trailing segment). It reads as "your guide," never a menu item.
- **Hidden during focused flows** (the fitting, entry/verify) — those stay full-bleed, one-breath screens.
  **Overridden 2026-08-19 (R-1, Doug):** the bar is app-wide now, so the front door and the claim carry it as well, and it is withheld only from the staff desk and the account screens. It never offers a destination the current visitor would be bounced from, so do not revert it as a regression (`footerPlan()`, `lib/shell.ts`).
- Motion: cross-fade route transitions, no bounce; honor `prefers-reduced-motion`.

