"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { cn } from "../../lib/utils";
import { footerPlan, type FooterVisitor } from "../../lib/shell";
import { useBackTarget } from "./back-context";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../../content/support";

// Persistent bottom navigation (DESIGN.md "Bottom navigation").
//
// R-1 (Doug, 2026-08-19): the bar is app-wide now, rendered from the ROOT
// layout via components/nav/app-footer.tsx rather than from the app/(app)
// route group. It still owns the pathname (usePathname), but who is looking
// arrives as a prop, because only the server can answer that. Which tabs a
// given visitor may be offered is decided by footerPlan() in lib/shell.ts —
// never here, and never a tab that would bounce them.
// Frosted/translucent bar, one hairline top border, safe-area inset. Four utility
// destinations (active = --dawn, inactive = --mist), then the Coach set apart by a
// hairline — the guide's presence in the serif voice, not a peer tab. One active
// at a time, derived from usePathname. Route transitions cross-fade; color-only
// transitions keep it calm and reduced-motion-safe.

type IconProps = React.SVGProps<SVGSVGElement>;

/** Quiet line icons — stroke currentColor, no fill (DESIGN.md restraint). */
function MoonIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

function ShieldIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 3l7 3v5c0 4.4-3 7.4-7 8.5-4-1.1-7-4.1-7-8.5V6l7-3Z" />
    </svg>
  );
}

function InboxIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z" />
      <path d="M4 13h5a3 3 0 0 0 6 0h5" />
    </svg>
  );
}

function BagIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M6 8h12l-1 11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

interface Tab {
  href: string;
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  /** Extra path prefixes that also mark this tab active (e.g. /guarantee/help). */
  match?: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { href: "/tonight", label: "Tonight", Icon: MoonIcon },
  {
    href: "/guarantee",
    label: "Guarantee",
    Icon: ShieldIcon,
    match: (p) => p === "/guarantee" || p.startsWith("/guarantee/"),
  },
  { href: "/requests", label: "Requests", Icon: InboxIcon, match: (p) => p.startsWith("/requests") },
  { href: "/shop", label: "Shop", Icon: BagIcon, match: (p) => p.startsWith("/shop") },
];

export function BottomNav({ visitor }: { visitor: FooterVisitor }) {
  const pathname = usePathname() || "";
  // R-2: the leading slot is filled by whichever flow is mounted, through the
  // back registry. R-1 shipped it as a `leading` prop, which nothing could
  // reach: the only caller is the root layout, and it has no pathname and no
  // flow state. Nothing registered renders nothing, so a page without a flow
  // gets exactly the bar R-1 shipped.
  const back = useBackTarget();

  // One bar, every surface (lib/shell.ts owns the rules). Claims mode — the v3
  // default — shows Guarantee · Requests · Shop and no Coach; the companion
  // product keeps Tonight and the guide; and either way a destination this
  // visitor would be bounced from is never offered. Same component throughout,
  // so the bar never forks.
  const plan = footerPlan(pathname, visitor);
  // A registered Back keeps the bar alive on its own. footerPlan answers a
  // question about TABS, and it withholds the bar from staff everywhere — which
  // silently took Back away from an agent filing on a customer's behalf, a
  // control the fitting used to render unconditionally (reviews, 2026-08-19).
  if (!plan.visible && !back) return null;

  const tabs = plan.visible
    ? TABS.filter((tab) => plan.hrefs.includes(tab.href))
    : [];
  const coach = plan.coach;
  /** Nowhere else to go: the bar carries the way to a person instead. */
  const bare = plan.visible && plan.bare;
  /** A lone tab keeps its natural width; stretching it reads as a button. */
  const stretch = tabs.length > 1;

  const isActive = (tab: Tab) =>
    tab.match ? tab.match(pathname) : pathname === tab.href;
  const coachActive = pathname.startsWith("/concierge");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-surface2/60 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-md items-stretch",
          // Only centre when there is nothing anchored left, or Back drifts
          // to the middle and its hairline reads as a divider between peers.
          stretch || back ? undefined : "justify-center"
        )}
      >
        {/* Divided by the same hairline the Coach uses, so Back reads as
            chrome rather than as a peer tab. h-full, not padding alone: the
            cell stretches to the bar, so the control matches the tabs' touch
            target instead of being the height of its own text. */}
        {back && (
          <div className="flex shrink-0 items-stretch border-r border-[var(--line)]">
            <button
              type="button"
              onClick={back.run}
              aria-label={back.label}
              className="flex h-full items-center px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
            >
              {/* Decorative, like the Coach's word mark and the support middot:
                  the chevron is not part of the name a screen reader reads. */}
              <span aria-hidden>&lsaquo;&nbsp;</span>Back
            </button>
          </div>
        )}

        {/* Nothing reachable — an anonymous claimant, or an account with
            nothing linked yet. An empty bar would be chrome that does nothing,
            so it offers the two things that always work: a phone and an inbox
            (content/support.ts, the single source). */}
        {bare && (
          <div className="flex flex-1 items-center justify-center gap-3">
            {/* The padding lives on the anchors, not this row: on the wrapper it
                left each link a 15px hit area next to 59px tabs (WCAG 2.5.8).
                hover:text-cloud is the house treatment for a mist mono label;
                dawn is reserved for the active destination. */}
            <a
              href={`tel:${SUPPORT_PHONE.replace(/[^0-9+]/g, "")}`}
              className="py-3.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
            >
              Call {SUPPORT_PHONE}
            </a>
            <span aria-hidden className="text-[10px] text-mist/40">
              &middot;
            </span>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="py-3.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
            >
              Email us
            </a>
          </div>
        )}

        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
                stretch ? "flex-1" : "px-8",
                active ? "text-dawn" : "text-mist hover:text-cloud"
              )}
            >
              <tab.Icon className="h-5 w-5" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* The Coach — set apart by a hairline; the guide's presence, not a tab.
            Gone entirely in claims mode — hidden AND unreachable. */}
        {coach && (
          <Link
            href="/concierge"
            aria-current={coachActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center gap-1 border-l border-[var(--line)] px-5 py-2.5 text-dawn transition-[filter]",
              coachActive ? "brightness-110" : "hover:brightness-110"
            )}
          >
            <span aria-hidden className="font-serif text-[17px] italic leading-none">
              Coach
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
              Your guide
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}
