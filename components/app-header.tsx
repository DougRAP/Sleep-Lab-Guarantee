import { Logo } from "./Logo";
import { SignOut } from "./auth/sign-out";
import { PurchaseSwitcher } from "./purchase-switcher";
import { getRepository } from "../lib/data";
import { getViewer } from "../lib/auth/user";
import { isAuthConfigured } from "../lib/auth/config";
import { readActiveGuaranteeId, resolveActiveGuarantee } from "../lib/active-guarantee";

/**
 * The sticky consumer header (review 2026-07-22): the logo, who is signed in,
 * and the quiet way out — on every page, always visible. The day count no
 * longer lives here; it sits as an eyebrow above each page's H1 (DayCount),
 * so the header is free for identity ("too many windows open — which one am
 * I?"). Carries the safe-area top inset so pages don't need their own.
 *
 * B-28: when a real-auth account holds more than one purchase, a compact
 * switcher appears so they can move between them. Single-purchase accounts and
 * the light-verify fallback see nothing new.
 */
export async function AppHeader({ email }: { email?: string | null }) {
  const switcher = await purchaseSwitcher();
  return (
    <header className="sticky top-0 z-40 -mx-6 border-b border-[var(--line)] bg-surface2/60 px-6 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <Logo />
        <div className="flex min-w-0 items-center gap-3">
          {switcher}
          {email && (
            <span
              title={email}
              className="min-w-0 truncate font-mono text-[11px] tracking-[0.02em] text-mist"
            >
              {email}
            </span>
          )}
          <SignOut className="shrink-0" />
        </div>
      </div>
    </header>
  );
}

/** The switcher element, or null when there's nothing to switch. */
async function purchaseSwitcher() {
  if (!isAuthConfigured()) return null;
  const viewer = await getViewer();
  if (!viewer) return null;
  const owned = await getRepository().listGuaranteesForUser(viewer.userId);
  if (owned.length < 2) return null;
  const active = resolveActiveGuarantee(owned, await readActiveGuaranteeId());
  if (!active) return null;
  return (
    <PurchaseSwitcher
      activeId={active.id}
      purchases={owned.map((g) => ({
        id: g.id,
        salesOrderNumber: g.salesOrderNumber,
        productDescription: g.productDescription,
      }))}
    />
  );
}
