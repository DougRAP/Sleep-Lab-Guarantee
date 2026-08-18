"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { cn } from "../../lib/utils";
import { isClaimsMode } from "../../lib/demo";
import { isCoachEnabled, navHrefs } from "../../lib/shell";

// Persistent bottom navigation (DESIGN.md "Bottom navigation").
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

export function BottomNav() {
  const pathname = usePathname() || "";

  // One bar, two modes (lib/shell.ts owns which destinations exist). Claims
  // mode — the v3 default — shows Guarantee · Requests · Shop and no Coach;
  // the companion product keeps Tonight and the guide. Same component either
  // way, so the bar never forks.
  const claimsMode = isClaimsMode();
  const hrefs = navHrefs(claimsMode);
  const tabs = TABS.filter((tab) => hrefs.includes(tab.href));
  const coach = isCoachEnabled(claimsMode);

  const isActive = (tab: Tab) =>
    tab.match ? tab.match(pathname) : pathname === tab.href;
  const coachActive = pathname.startsWith("/concierge");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-surface2/60 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex w-full max-w-md items-stretch">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors",
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
